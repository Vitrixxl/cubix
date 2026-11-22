//! Smart cubes (src/client/lib/bluetooth/cubes.ts): each protocol turns the cube's notifications into events (whole
//! states as Kociemba facelets, white on top and green in front; turns; battery; how a cube with a gyroscope is held).
//! GAN (Gen2, Gen3, Gen4, and the MoYu AI 2023 speaking Gen2), MoYu32, QiYi, Giiker and Xiaomi, GoCube and Rubik's
//! Connected. The radio is the app's; this module is bytes in, events out.
use aes::Aes128;
use aes::cipher::{BlockDecrypt, BlockEncrypt, KeyInit, generic_array::GenericArray};
use std::collections::HashMap;

pub const SOLVED: &str = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

#[derive(Clone, Debug, PartialEq)]
pub enum Event {
    Move { turn: String, at: i64 },
    Orientation([f32; 4]),
    Facelets(String),
    Battery(u8),
}

/// `length` bits from bit `start`, the first bit the highest.
pub fn bits(b: &[u8], start: usize, length: usize) -> u32 {
    let mut v = 0u32;
    for i in start..start + length {
        v = v * 2 + ((b.get(i >> 3).copied().unwrap_or(0) >> (7 - (i & 7))) & 1) as u32;
    }
    v
}

fn le(b: &[u8], at: usize, n: usize) -> u64 { (0..n).rev().fold(0u64, |v, i| v * 256 + b[at + i] as u64) }
fn be32(b: &[u8], at: usize) -> u64 { u32::from_be_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]]) as u64 }
fn message(length: usize, head: &[u8]) -> Vec<u8> {
    let mut m = vec![0u8; length];
    m[..head.len()].copy_from_slice(head);
    m
}

const CORNERS: [[usize; 3]; 8] = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
const EDGES: [[usize; 2]; 12] = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];

/// The facelets of a cube given by its pieces (the last of each worked out when `complete`); None when they are not
/// a cube (what a wrong key decrypts).
pub fn pieces_to_facelets(mut cp: Vec<u32>, mut co: Vec<u32>, mut ep: Vec<u32>, mut eo: Vec<u32>, complete: bool, corners: &[[usize; 3]; 8], edges: &[[usize; 2]; 12]) -> Option<String> {
    if complete {
        cp.push(28u32.wrapping_sub(cp.iter().sum()));
        co.push((3 - co.iter().sum::<u32>() % 3) % 3);
        ep.push(66u32.wrapping_sub(ep.iter().sum()));
        eo.push((2 - eo.iter().sum::<u32>() % 2) % 2);
    }
    let perm = |p: &[u32], n: u32| p.len() == n as usize && p.iter().all(|v| *v < n) && { let mut s = p.to_vec(); s.sort(); s.dedup(); s.len() == n as usize };
    if !perm(&cp, 8) || !perm(&ep, 12) || co.iter().any(|v| *v > 2) || eo.iter().any(|v| *v > 1) { return None }
    let solved: Vec<char> = SOLVED.chars().collect();
    let mut f = solved.clone();
    for i in 0..8 {
        for k in 0..3 {
            f[corners[i][(k + co[i] as usize) % 3]] = solved[corners[cp[i] as usize][k]];
        }
    }
    for i in 0..12 {
        for k in 0..2 {
            f[edges[i][(k + eo[i] as usize) % 2]] = solved[edges[ep[i] as usize][k]];
        }
    }
    Some(f.into_iter().collect())
}

/// Whether 54 facelets are a cube's colours: nine of each, the centres in place.
pub fn is_cube(f: &str) -> bool {
    f.len() == 54 && f.chars().all(|c| "URFDLB".contains(c)) && "URFDLB".chars().enumerate().all(|(i, face)| f.as_bytes()[i * 9 + 4] as char == face && f.chars().filter(|c| *c == face).count() == 9)
}

/// AES-128 with the cube's MAC address added to the first six bytes of the key and the IV; a message's first 16
/// bytes are one CBC block, its last 16 another.
#[derive(Clone)]
pub struct MacCipher {
    aes: Aes128,
    iv: [u8; 16],
}

impl MacCipher {
    pub fn new(key: &[u8; 16], iv: &[u8; 16], mac: &[u8]) -> Self {
        let k: Vec<u8> = key.iter().enumerate().map(|(i, v)| if i < 6 { ((*v as u16 + mac[5 - i] as u16) % 255) as u8 } else { *v }).collect();
        let v: [u8; 16] = std::array::from_fn(|i| if i < 6 { ((iv[i] as u16 + mac[5 - i] as u16) % 255) as u8 } else { iv[i] });
        Self { aes: Aes128::new(GenericArray::from_slice(&k)), iv: v }
    }

    fn block(&self, data: &mut [u8], at: usize, encrypt: bool) {
        let b = GenericArray::from_mut_slice(&mut data[at..at + 16]);
        if encrypt {
            for (i, x) in b.iter_mut().enumerate() {
                *x ^= self.iv[i];
            }
            self.aes.encrypt_block(b);
        } else {
            self.aes.decrypt_block(b);
            for (i, x) in b.iter_mut().enumerate() {
                *x ^= self.iv[i];
            }
        }
    }

    pub fn encrypt(&self, input: &[u8]) -> Vec<u8> {
        let mut d = input.to_vec();
        self.block(&mut d, 0, true);
        if d.len() > 16 {
            let n = d.len();
            self.block(&mut d, n - 16, true);
        }
        d
    }

    pub fn decrypt(&self, input: &[u8]) -> Vec<u8> {
        let mut d = input.to_vec();
        if d.len() > 16 {
            let n = d.len();
            self.block(&mut d, n - 16, false);
        }
        self.block(&mut d, 0, false);
        d
    }
}

pub const GAN_KEY: [u8; 16] = [0x01, 0x02, 0x42, 0x28, 0x31, 0x91, 0x16, 0x07, 0x20, 0x05, 0x18, 0x54, 0x42, 0x11, 0x12, 0x53];
pub const GAN_IV: [u8; 16] = [0x11, 0x03, 0x32, 0x28, 0x21, 0x01, 0x76, 0x27, 0x20, 0x95, 0x78, 0x14, 0x32, 0x12, 0x02, 0x43];
const AICUBE_KEY: [u8; 16] = [0x05, 0x12, 0x02, 0x45, 0x02, 0x01, 0x29, 0x56, 0x12, 0x78, 0x12, 0x76, 0x81, 0x01, 0x08, 0x03];
const AICUBE_IV: [u8; 16] = [0x01, 0x44, 0x28, 0x06, 0x86, 0x21, 0x22, 0x28, 0x51, 0x05, 0x08, 0x31, 0x82, 0x02, 0x21, 0x06];
const MOYU32_KEY: [u8; 16] = [21, 119, 58, 92, 103, 14, 45, 31, 23, 103, 42, 19, 155, 103, 82, 87];
const MOYU32_IV: [u8; 16] = [17, 35, 38, 37, 134, 42, 44, 59, 85, 6, 127, 49, 126, 103, 33, 87];
const QIYI_KEY: [u8; 16] = [87, 177, 249, 171, 205, 90, 232, 167, 156, 185, 140, 231, 87, 140, 81, 8];

/// The time of a turn on the cube's own clock, set on the device's: turns keep the intervals the cube measured.
#[derive(Default)]
struct CubeClock {
    offset: Option<i64>,
}

impl CubeClock {
    fn at(&mut self, cube: i64, local: i64) -> i64 {
        let off = *self.offset.get_or_insert(local - cube);
        let mut at = cube + off;
        if (at - local).abs() > 2000 {
            self.offset = Some(local - cube);
            at = local;
        }
        at.min(local)
    }
}

/// How a GAN cube with a gyroscope is held, from its first report (see the web's `GanGyro`).
#[derive(Default)]
struct Gyro {
    basis: Option<[f32; 4]>,
}

fn qmul(a: [f32; 4], b: [f32; 4]) -> [f32; 4] {
    let [aw, ax, ay, az] = a;
    let [bw, bx, by, bz] = b;
    [aw * bw - ax * bx - ay * by - az * bz, aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw]
}

impl Gyro {
    fn orientation(&mut self, x: f32, y: f32, z: f32, w: f32) -> [f32; 4] {
        let q = [w, x, z, -y];
        let inv = |p: [f32; 4]| [p[0], -p[1], -p[2], -p[3]];
        let basis = *self.basis.get_or_insert(inv(q));
        let z2 = [0.0, 0.0, 0.0, 1.0];
        let r = qmul(qmul(z2, qmul(basis, q)), inv(z2));
        let n = r.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-6);
        r.map(|v| v / n)
    }
}

fn signed15(v: u32) -> f32 { (1.0 - (v >> 15) as f32 * 2.0) * (v & 0x7fff) as f32 / 0x7fff as f32 }
fn turn(face: usize, prime: u32) -> String { format!("{}{}", &"URFDLB"[face..face + 1], if prime != 0 { "'" } else { "" }) }

fn gan_state(m: &[u8], at: usize, gap: usize) -> Option<String> {
    let (mut cp, mut co, mut ep, mut eo) = (vec![], vec![], vec![], vec![]);
    for i in 0..7 {
        cp.push(bits(m, at + i * 3, 3));
        co.push(bits(m, at + 21 + i * 2, 2));
    }
    for i in 0..11 {
        ep.push(bits(m, at + gap + 35 + i * 4, 4));
        eo.push(bits(m, at + gap + 79 + i, 1));
    }
    pieces_to_facelets(cp, co, ep, eo, true, &CORNERS, &EDGES)
}

/// What a protocol's decoder does: what to send once listening, what to send each minute, what it hears.
pub trait Decoder: Send {
    /// Messages to send once listening, by channel.
    fn hello(&mut self) -> Vec<(usize, Vec<u8>)>;
    fn poll(&mut self) -> Vec<(usize, Vec<u8>)> { vec![] }
    /// Channels whose value is read once listening.
    fn reads(&self) -> Vec<usize> { vec![] }
    /// What a notification says; messages to send back go in `out`.
    fn receive(&mut self, channel: usize, data: &[u8], at: i64, out: &mut Vec<(usize, Vec<u8>)>) -> Vec<Event>;
}

struct GanGen2 {
    cipher: MacCipher,
    serial: i32,
    cube: i64,
    last_at: i64,
    clock: CubeClock,
    gyro: Gyro,
}

impl Decoder for GanGen2 {
    fn hello(&mut self) -> Vec<(usize, Vec<u8>)> { [0x05u8, 0x04, 0x09].iter().map(|h| (0, self.cipher.encrypt(&message(20, &[*h])))).collect() }
    fn poll(&mut self) -> Vec<(usize, Vec<u8>)> { vec![(0, self.cipher.encrypt(&message(20, &[0x09])))] }
    fn receive(&mut self, _: usize, data: &[u8], at: i64, _: &mut Vec<(usize, Vec<u8>)>) -> Vec<Event> {
        if data.len() < 16 { return vec![] }
        let m = self.cipher.decrypt(data);
        match bits(&m, 0, 4) {
            0x01 => vec![Event::Orientation(self.gyro.orientation(signed15(bits(&m, 20, 16)), signed15(bits(&m, 36, 16)), signed15(bits(&m, 52, 16)), signed15(bits(&m, 4, 16))))],
            0x02 if self.serial >= 0 => {
                let now = bits(&m, 4, 8) as i32;
                let n = ((now - self.serial) & 0xff).min(7) as usize;
                self.serial = now;
                let mut events = vec![];
                for i in (0..n).rev() {
                    let gap = bits(&m, 47 + 16 * i, 16) as i64;
                    self.cube += if gap != 0 { gap } else { at - self.last_at };
                    events.push(Event::Move { turn: turn(bits(&m, 12 + 5 * i, 4) as usize % 6, bits(&m, 16 + 5 * i, 1)), at: self.clock.at(self.cube, at) });
                }
                if n > 0 { self.last_at = at }
                events
            }
            0x04 => {
                if self.serial < 0 { self.serial = bits(&m, 4, 8) as i32 }
                gan_state(&m, 12, 0).map(Event::Facelets).into_iter().collect()
            }
            0x09 => vec![Event::Battery(bits(&m, 8, 8).min(100) as u8)],
            _ => vec![],
        }
    }
}

struct GanGen34 {
    gen4: bool,
    cipher: MacCipher,
    clock: CubeClock,
    gyro: Gyro,
    last: i32,
    last_move_at: i64,
    waiting: HashMap<i32, (String, i64)>,
}

impl GanGen34 {
    fn o(&self) -> usize { if self.gen4 { 0 } else { 8 } }
    fn command(&self, head: &[u8]) -> Vec<u8> { self.cipher.encrypt(&message(if self.gen4 { 20 } else { 16 }, head)) }
    fn facelets_cmd(&self) -> Vec<u8> { self.command(if self.gen4 { &[0xdd, 0x04, 0x00, 0xed, 0x00, 0x00] } else { &[0x68, 0x01] }) }
    fn battery_cmd(&self) -> Vec<u8> { self.command(if self.gen4 { &[0xdd, 0x04, 0x00, 0xef, 0x00, 0x00] } else { &[0x68, 0x07] }) }
    fn history(&self, mut serial: i32, mut count: i32, out: &mut Vec<(usize, Vec<u8>)>) {
        if serial % 2 == 0 { serial = (serial - 1) & 0xff }
        if count % 2 != 0 { count += 1 }
        out.push((0, self.command(&[if self.gen4 { 0xd1 } else { 0x68 }, if self.gen4 { 0x04 } else { 0x03 }, serial as u8, 0, count.min(serial + 1) as u8, 0])));
    }
    fn flush(&mut self, out: &mut Vec<(usize, Vec<u8>)>) -> Vec<Event> {
        let mut events = vec![];
        loop {
            let next = (self.last + 1) & 0xff;
            let Some((turn, at)) = self.waiting.remove(&next) else { break };
            events.push(Event::Move { turn, at });
            self.last = next;
        }
        if self.waiting.len() > 16 {
            self.waiting.clear();
            self.last = -1;
            out.push((0, self.facelets_cmd()));
        } else if !self.waiting.is_empty() {
            let head = self.waiting.keys().map(|s| (s - self.last) & 0xff).min().unwrap();
            self.history((self.last + head) & 0xff, head, out);
        }
        events
    }
}

impl Decoder for GanGen34 {
    fn hello(&mut self) -> Vec<(usize, Vec<u8>)> {
        let hardware = self.command(if self.gen4 { &[0xdf, 0x03, 0x00, 0x00, 0x00] } else { &[0x68, 0x04] });
        vec![(0, hardware), (0, self.facelets_cmd()), (0, self.battery_cmd())]
    }
    fn poll(&mut self) -> Vec<(usize, Vec<u8>)> { vec![(0, self.battery_cmd())] }
    fn receive(&mut self, _: usize, data: &[u8], at: i64, out: &mut Vec<(usize, Vec<u8>)>) -> Vec<Event> {
        if data.len() < 16 { return vec![] }
        let m = self.cipher.decrypt(data);
        if !self.gen4 && m[0] != 0x55 { return vec![] }
        let o = self.o();
        let kind = m[o / 8];
        let length = m[o / 8 + 1] as usize;
        if kind == 0x01 && self.last >= 0 {
            let serial = (le(&m, o / 8 + 6, 2) & 0xff) as i32;
            let face = [2u32, 32, 8, 1, 16, 4].iter().position(|f| *f == bits(&m, o + 66, 6));
            let prime = bits(&m, o + 64, 2);
            let ahead = (serial - self.last) & 0xff;
            self.last_move_at = at;
            let Some(face) = face else { return vec![] };
            if ahead == 0 || ahead > 128 { return vec![] }
            let t = self.clock.at(le(&m, o / 8 + 2, 4) as i64, at);
            self.waiting.insert(serial, (turn(face, prime), t));
            return self.flush(out);
        }
        if kind == if self.gen4 { 0xd1 } else { 0x06 } && self.last >= 0 {
            let start = m[o / 8 + 2] as i32;
            for i in 0..(length.saturating_sub(1) * 2) {
                let serial = (start - i as i32) & 0xff;
                let face = [1u32, 5, 3, 0, 4, 2].iter().position(|f| *f == bits(&m, o + 24 + 4 * i, 3));
                let ahead = (serial - self.last) & 0xff;
                if let Some(face) = face && !self.waiting.contains_key(&serial) && ahead > 0 && ahead < 128 {
                    self.waiting.insert(serial, (turn(face, bits(&m, o + 27 + 4 * i, 1)), at));
                }
            }
            return self.flush(out);
        }
        if kind == if self.gen4 { 0xed } else { 0x02 } {
            let serial = (le(&m, o / 8 + 2, 2) & 0xff) as i32;
            if self.last < 0 {
                self.last = serial;
            } else if serial != self.last {
                if at - self.last_move_at > 500 && serial != 0 { self.history(serial, (serial - self.last) & 0xff, out) }
                return vec![];
            }
            return gan_state(&m, o + 32, 2).map(Event::Facelets).into_iter().collect();
        }
        if !self.gen4 && kind == 0x10 { return vec![Event::Battery(m[3].min(100))] }
        if self.gen4 && kind == 0xef { return vec![Event::Battery(m[1 + length].min(100))] }
        if self.gen4 && kind == 0xec {
            return vec![Event::Orientation(self.gyro.orientation(signed15(bits(&m, 32, 16)), signed15(bits(&m, 48, 16)), signed15(bits(&m, 64, 16)), signed15(bits(&m, 16, 16))))];
        }
        vec![]
    }
}

struct MoYu32 {
    cipher: MacCipher,
    count: i32,
    cube: i64,
    clock: CubeClock,
}

impl Decoder for MoYu32 {
    fn hello(&mut self) -> Vec<(usize, Vec<u8>)> { [161u8, 163, 164].iter().map(|op| (0, self.cipher.encrypt(&message(20, &[*op])))).collect() }
    fn poll(&mut self) -> Vec<(usize, Vec<u8>)> { vec![(0, self.cipher.encrypt(&message(20, &[164])))] }
    fn receive(&mut self, _: usize, data: &[u8], at: i64, _: &mut Vec<(usize, Vec<u8>)>) -> Vec<Event> {
        if data.len() < 16 { return vec![] }
        let m = self.cipher.decrypt(data);
        match m[0] {
            163 => {
                let mut f = String::new();
                for face in [2usize, 5, 0, 3, 4, 1] {
                    for j in 0..8 {
                        f.push("FBUDLR".chars().nth(bits(&m, 8 + face * 24 + j * 3, 3) as usize).unwrap_or('?'));
                        if j == 3 { f.push("FBUDLR".chars().nth(face).unwrap()) }
                    }
                }
                self.count = m[19] as i32;
                vec![Event::Facelets(f)]
            }
            164 => vec![Event::Battery(m[1].min(100))],
            165 if self.count >= 0 => {
                let now = m[11] as i32;
                let n = ((now - self.count) & 0xff).min(5) as usize;
                self.count = now;
                let mut events = vec![];
                for i in (0..n).rev() {
                    let code = bits(&m, 96 + i * 5, 5) as usize;
                    if code >= 12 { return vec![] }
                    self.cube += bits(&m, 8 + i * 16, 16) as i64;
                    events.push(Event::Move { turn: format!("{}{}", &"FBUDLR"[code >> 1..(code >> 1) + 1], if code & 1 != 0 { "'" } else { "" }), at: self.clock.at(self.cube, at) });
                }
                events
            }
            _ => vec![],
        }
    }
}

pub fn crc16modbus(data: &[u8]) -> u16 {
    let mut crc = 0xffffu16;
    for b in data {
        crc ^= *b as u16;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xa001 } else { crc >> 1 };
        }
    }
    crc
}

fn qiyi_aes() -> Aes128 { Aes128::new(GenericArray::from_slice(&QIYI_KEY)) }

pub fn qiyi_frame(content: &[u8]) -> Vec<u8> {
    let mut body = vec![0xfe, content.len() as u8 + 4];
    body.extend_from_slice(content);
    let crc = crc16modbus(&body);
    let mut data = vec![0u8; (body.len() + 2).div_ceil(16) * 16];
    data[..body.len()].copy_from_slice(&body);
    data[body.len()] = (crc & 0xff) as u8;
    data[body.len() + 1] = (crc >> 8) as u8;
    let aes = qiyi_aes();
    for c in data.chunks_mut(16) {
        aes.encrypt_block(GenericArray::from_mut_slice(c));
    }
    data
}

pub fn qiyi_open(data: &[u8]) -> Option<Vec<u8>> {
    if data.len() % 16 != 0 || data.is_empty() { return None }
    let mut m = data.to_vec();
    let aes = qiyi_aes();
    for c in m.chunks_mut(16) {
        aes.decrypt_block(GenericArray::from_mut_slice(c));
    }
    let len = m[1] as usize;
    (m[0] == 0xfe && len >= 4 && len <= m.len() && crc16modbus(&m[..len]) == 0).then(|| m[..len].to_vec())
}

fn qiyi_facelets(m: &[u8]) -> String { (0..54).map(|i| "LRDUFB".chars().nth(((m[7 + (i >> 1)] >> ((i % 2) * 4)) & 0xf) as usize).unwrap_or('?')).collect() }
fn qiyi_turn(code: u8) -> String { format!("{}{}", &"LRDUFB"[((code - 1) >> 1) as usize..((code - 1) >> 1) as usize + 1], if code & 1 != 0 { "'" } else { "" }) }

struct QiYi {
    mac: Vec<u8>,
    last: u64,
    clock: CubeClock,
}

impl Decoder for QiYi {
    fn hello(&mut self) -> Vec<(usize, Vec<u8>)> {
        let mut c = vec![0x00, 0x6b, 0x01, 0x00, 0x00, 0x22, 0x06, 0x00, 0x02, 0x08, 0x00];
        c.extend(self.mac.iter().rev());
        vec![(0, qiyi_frame(&c))]
    }
    fn receive(&mut self, _: usize, data: &[u8], at: i64, out: &mut Vec<(usize, Vec<u8>)>) -> Vec<Event> {
        let Some(m) = qiyi_open(data) else { return vec![] };
        let op = m[2];
        let ts = be32(&m, 3);
        let ack = |out: &mut Vec<(usize, Vec<u8>)>| out.push((0, qiyi_frame(&m[2..7])));
        if op == 0x02 || op == 0x05 {
            if op == 0x02 { ack(out) }
            self.last = ts;
            return vec![Event::Facelets(qiyi_facelets(&m)), Event::Battery(m[35])];
        }
        if op != 0x03 || m.len() < 92 { return vec![] }
        if m[91] != 0 { ack(out) }
        let mut turns: Vec<(u64, u8)> = vec![(ts, m[34])];
        let mut off = 36;
        while off + 5 <= 91 {
            if m[off..off + 5].iter().any(|b| *b != 0xff) {
                let t = be32(&m, off);
                if !turns.iter().any(|x| x.0 == t) { turns.push((t, m[off + 4])) }
            }
            off += 5;
        }
        turns.retain(|(t, code)| *t > self.last && (1..=12).contains(code));
        turns.sort();
        let mut events: Vec<Event> = turns.iter().map(|(t, code)| Event::Move { turn: qiyi_turn(*code), at: self.clock.at((*t as f64 / 1.6) as i64, at) }).collect();
        self.last = self.last.max(ts);
        events.push(Event::Facelets(if m[91] != 0 { SOLVED.into() } else { qiyi_facelets(&m) }));
        events.push(Event::Battery(m[35]));
        events
    }
}

const GIIKER_KEY: [u8; 36] = [176, 81, 104, 224, 86, 137, 237, 119, 38, 26, 193, 161, 210, 126, 150, 81, 93, 13, 236, 249, 89, 235, 88, 24, 113, 81, 214, 131, 130, 199, 2, 169, 39, 165, 171, 41];
const GIIKER_CORNERS: [[usize; 3]; 8] = [[26, 15, 29], [20, 8, 9], [18, 38, 6], [24, 27, 44], [51, 35, 17], [45, 11, 2], [47, 0, 36], [53, 42, 33]];
const GIIKER_EDGES: [[usize; 2]; 12] = [[25, 28], [23, 12], [19, 7], [21, 41], [32, 16], [5, 10], [3, 37], [30, 43], [52, 34], [48, 14], [46, 1], [50, 39]];

fn giiker_digits(data: &[u8]) -> Vec<u32> {
    let mut raw: Vec<u8> = data[..20].to_vec();
    if raw[18] == 0xa7 {
        let (k1, k2) = ((raw[19] >> 4) as usize, (raw[19] & 0xf) as usize);
        for i in 0..18 {
            raw[i] = (raw[i] as u16 + GIIKER_KEY[i + k1] as u16 + GIIKER_KEY[i + k2] as u16) as u8;
        }
        raw.truncate(18);
    }
    raw.iter().flat_map(|b| [(b >> 4) as u32, (b & 0xf) as u32]).collect()
}

#[derive(Default)]
struct Giiker {
    facelets: Option<String>,
}

impl Decoder for Giiker {
    fn hello(&mut self) -> Vec<(usize, Vec<u8>)> { vec![(1, vec![0xb5])] }
    fn poll(&mut self) -> Vec<(usize, Vec<u8>)> { vec![(1, vec![0xb5])] }
    fn reads(&self) -> Vec<usize> { vec![0] }
    fn receive(&mut self, channel: usize, data: &[u8], at: i64, _: &mut Vec<(usize, Vec<u8>)>) -> Vec<Event> {
        if channel == 1 { return data.get(1).map(|b| vec![Event::Battery(*b)]).unwrap_or_default() }
        if data.len() < 20 { return vec![] }
        let h = giiker_digits(data);
        let flip = [-1i32, 1, -1, 1, 1, -1, 1, -1];
        let eo: Vec<u32> = (0..3).flat_map(|i| [8, 4, 2, 1].map(|mask| (h[i + 28] & mask != 0) as u32)).collect();
        let state = pieces_to_facelets(h[..8].iter().map(|v| v.wrapping_sub(1)).collect(), h[8..16].iter().enumerate().map(|(i, v)| ((3 + *v as i32 * flip[i]).rem_euclid(3)) as u32).collect(), h[16..28].iter().map(|v| v.wrapping_sub(1)).collect(), eo, false, &GIIKER_CORNERS, &GIIKER_EDGES);
        let Some(state) = state else { return vec![] };
        let mut events = vec![];
        let face = "?BDLURF".chars().nth(h[32] as usize).unwrap_or('?');
        let amount = if h[33] == 9 { 2 } else { h[33] };
        if self.facelets.as_ref().is_some_and(|f| *f != state) && face != '?' && (1..=3).contains(&amount) {
            events.push(Event::Move { turn: format!("{face}{}", ["", "", "2", "'"][amount as usize]), at });
        }
        self.facelets = Some(state.clone());
        events.push(Event::Facelets(state));
        events
    }
}

#[derive(Default)]
struct GoCube {
    turns: usize,
}

impl Decoder for GoCube {
    fn hello(&mut self) -> Vec<(usize, Vec<u8>)> { vec![(0, vec![0x33]), (0, vec![0x32])] }
    fn poll(&mut self) -> Vec<(usize, Vec<u8>)> { vec![(0, vec![0x32])] }
    fn receive(&mut self, _: usize, d: &[u8], at: i64, out: &mut Vec<(usize, Vec<u8>)>) -> Vec<Event> {
        let n = d.len();
        if n < 7 || d[0] != 0x2a || d[n - 2] != 0x0d || d[n - 1] != 0x0a { return vec![] }
        if d[..n - 3].iter().fold(0u32, |a, b| a + *b as u32) & 0xff != d[n - 3] as u32 { return vec![] }
        match d[2] {
            1 => {
                let mut events = vec![];
                let mut i = 3;
                while i < n - 4 {
                    let c = d[i] as usize;
                    events.push(Event::Move { turn: format!("{}{}", &"BFUDRL"[c >> 1..(c >> 1) + 1], if c & 1 != 0 { "'" } else { "" }), at });
                    i += 2;
                }
                self.turns += events.len();
                if self.turns >= 20 {
                    self.turns = 0;
                    out.push((0, vec![0x33]));
                }
                events
            }
            2 if n >= 3 + 54 => {
                let mut f = ['?'; 54];
                let place = [5usize, 2, 0, 3, 1, 4];
                let around = [0usize, 1, 2, 5, 8, 7, 6, 3];
                let start = [0usize, 0, 6, 2, 0, 0];
                let letter = |v: u8| "BFUDRL".chars().nth(v as usize).unwrap_or('?');
                for a in 0..6 {
                    f[place[a] * 9 + 4] = letter(d[3 + a * 9]);
                    for i in 0..8 {
                        f[place[a] * 9 + around[(i + start[a]) % 8]] = letter(d[3 + a * 9 + i + 1]);
                    }
                }
                vec![Event::Facelets(f.iter().collect())]
            }
            5 => vec![Event::Battery(d[3])],
            _ => vec![],
        }
    }
}

/// A protocol's characteristic: the service, what it notifies on and what it is written to.
#[derive(Clone, Debug)]
pub struct Channel {
    pub service: &'static str,
    pub notify: &'static str,
    pub write: Option<&'static str>,
}

pub struct Protocol {
    pub id: &'static str,
    pub names: &'static [&'static str],
    pub channels: Vec<Channel>,
    /// The manufacturer ids under which it advertises its MAC address.
    pub companies: Vec<u16>,
    pub needs_mac: bool,
}

/// A 16-bit UUID made full.
pub fn uuid(id: &str) -> String { if id.len() == 4 { format!("0000{id}-0000-1000-8000-00805f9b34fb") } else { id.to_lowercase() } }

pub fn protocols() -> Vec<Protocol> {
    let gan: Vec<u16> = (0..256u16).map(|i| (i << 8) | 0x01).collect();
    let ch = |service, notify, write| Channel { service, notify, write };
    vec![
        Protocol { id: "gan-gen2", names: &["GAN", "MG", "AiCube"], channels: vec![ch("6e400001-b5a3-f393-e0a9-e50e24dc4179", "28be4cb6-cd67-11e9-a32f-2a2ae2dbcce4", Some("28be4a4a-cd67-11e9-a32f-2a2ae2dbcce4"))], companies: gan.clone(), needs_mac: true },
        Protocol { id: "gan-gen3", names: &["GAN"], channels: vec![ch("8653000a-43e6-47b7-9cb0-5fc21d4ae340", "8653000b-43e6-47b7-9cb0-5fc21d4ae340", Some("8653000c-43e6-47b7-9cb0-5fc21d4ae340"))], companies: gan.clone(), needs_mac: true },
        Protocol { id: "gan-gen4", names: &["GAN"], channels: vec![ch("00000010-0000-fff7-fff6-fff5fff4fff0", "fff6", Some("fff5"))], companies: gan, needs_mac: true },
        Protocol { id: "moyu32", names: &["WCU_MY3"], channels: vec![ch("0783b03e-7735-b5a0-1760-a305d2795cb0", "0783b03e-7735-b5a0-1760-a305d2795cb1", Some("0783b03e-7735-b5a0-1760-a305d2795cb2"))], companies: std::iter::once(0).chain((1..256u16).map(|i| i << 8)).collect(), needs_mac: true },
        Protocol { id: "qiyi", names: &["QY-QYSC", "XMD-TornadoV4-i"], channels: vec![ch("fff0", "fff6", Some("fff6"))], companies: vec![0x0504], needs_mac: true },
        Protocol { id: "giiker", names: &["Gi", "Mi Smart Magic Cube", "Hi-"], channels: vec![ch("aadb", "aadc", None), ch("aaaa", "aaab", Some("aaac"))], companies: vec![], needs_mac: false },
        Protocol { id: "gocube", names: &["GoCube", "Rubiks"], channels: vec![ch("6e400001-b5a3-f393-e0a9-e50e24dcca9e", "6e400003-b5a3-f393-e0a9-e50e24dcca9e", Some("6e400002-b5a3-f393-e0a9-e50e24dcca9e"))], companies: vec![], needs_mac: false },
    ]
}

/// The decoder of a protocol for a cube of this name and MAC address.
pub fn decoder(protocol: &str, name: &str, mac: Option<&[u8]>) -> Option<Box<dyn Decoder>> {
    let mac = mac.unwrap_or(&[0; 6]);
    Some(match protocol {
        "gan-gen2" => {
            let cipher = if name.starts_with("AiCube") { MacCipher::new(&AICUBE_KEY, &AICUBE_IV, mac) } else { MacCipher::new(&GAN_KEY, &GAN_IV, mac) };
            Box::new(GanGen2 { cipher, serial: -1, cube: 0, last_at: 0, clock: CubeClock::default(), gyro: Gyro::default() })
        }
        "gan-gen3" | "gan-gen4" => Box::new(GanGen34 { gen4: protocol == "gan-gen4", cipher: MacCipher::new(&GAN_KEY, &GAN_IV, mac), clock: CubeClock::default(), gyro: Gyro::default(), last: -1, last_move_at: 0, waiting: HashMap::new() }),
        "moyu32" => Box::new(MoYu32 { cipher: MacCipher::new(&MOYU32_KEY, &MOYU32_IV, mac), count: -1, cube: 0, clock: CubeClock::default() }),
        "qiyi" => Box::new(QiYi { mac: mac.to_vec(), last: 0, clock: CubeClock::default() }),
        "giiker" => Box::new(Giiker::default()),
        "gocube" => Box::new(GoCube::default()),
        _ => return None,
    })
}

/// The MAC address a cube advertises in its manufacturer data, by protocol.
pub fn mac_from(protocol: &str, data: &HashMap<u16, Vec<u8>>) -> Option<Vec<u8>> {
    match protocol {
        p if p.starts_with("gan") => (0..256u16).map(|i| (i << 8) | 1).find_map(|id| data.get(&id).filter(|d| d.len() >= 9).map(|d| d[3..9].iter().rev().copied().collect())),
        "moyu32" => data.values().find(|d| d.len() >= 6).map(|d| d[d.len() - 6..].iter().rev().copied().collect()),
        "qiyi" => data.get(&0x0504).filter(|d| d.len() >= 6).map(|d| d[..6].iter().rev().copied().collect()),
        _ => None,
    }
}

/// MAC addresses a cube's name hints at, to try in turn.
pub fn mac_guesses(protocol: &str, name: &str) -> Vec<String> {
    let tail4 = name.trim().rsplit(['_', '-']).next().unwrap_or("").to_uppercase();
    if tail4.len() != 4 || !tail4.chars().all(|c| c.is_ascii_hexdigit()) { return vec![] }
    let end = format!("{}:{}", &tail4[..2], &tail4[2..]);
    match protocol {
        "moyu32" if name.starts_with("WCU_MY33") => ["02", "01", "00"].iter().map(|m| format!("CF:30:16:{m}:{end}")).collect(),
        "moyu32" => ["00", "01", "02"].iter().map(|m| format!("CF:30:16:{m}:{end}")).collect(),
        "qiyi" if name.starts_with("XMD-TornadoV4-i") => vec![format!("CC:A6:00:00:{end}")],
        "qiyi" if name.starts_with("QY-QYSC-A") => vec![format!("CC:A2:00:00:{end}")],
        "qiyi" => vec![format!("CC:A3:00:00:{end}"), format!("CC:A3:00:01:{end}")],
        _ => vec![],
    }
}

/// The six bytes of a MAC address typed in any common way.
pub fn parse_mac(text: &str) -> Option<Vec<u8>> {
    let hex: String = text.chars().filter(|c| !matches!(c, ':' | '-' | ' ')).collect();
    (hex.len() == 12 && hex.chars().all(|c| c.is_ascii_hexdigit())).then(|| (0..6).map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap()).collect())
}

/// The cube these facelets show (Kociemba's order U R F D L B, white on top and green in front).
pub fn cube_of(facelets: &str) -> crate::cube::Cube {
    let colour = |c: u8| match c { b'U' => 0, b'D' => 1, b'F' => 2, b'B' => 3, b'R' => 4, _ => 5 };
    let b = facelets.as_bytes();
    let face = |k: usize| (0..9).map(|i| colour(b[k * 9 + i])).collect::<Vec<u8>>();
    let mut cube = crate::cube::Cube::solved(3);
    // The net's order: U L F R B D.
    cube.set_net(&[face(0), face(4), face(2), face(1), face(5), face(3)]);
    cube
}

/// The facelets of a 3×3 as a cube would report them.
pub fn facelets_of(cube: &crate::cube::Cube) -> String {
    let net = cube.net();
    let letter = |c: &u8| "UDFBRL".as_bytes()[*c as usize] as char;
    [0usize, 3, 2, 5, 1, 4].iter().flat_map(|f| net[*f].iter().map(letter)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn hex(s: &str) -> Vec<u8> { (0..s.len() / 2).map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap()).collect() }

    #[test]
    fn captures_of_real_cubes() {
        let fixtures: Value = serde_json::from_str(include_str!("../../../tests/fixtures/smartcubes.json")).unwrap();
        for (name, c) in fixtures["cubes"].as_object().unwrap() {
            let protocol = c["protocol"].as_str().unwrap();
            let p = protocols().into_iter().find(|x| x.id == protocol).unwrap();
            let mac = c["mac"].as_str().and_then(parse_mac);
            let mut d = decoder(protocol, name, mac.as_deref()).unwrap();
            let mut events = vec![];
            let mut at = 1_000_000;
            for t in c["traffic"].as_array().unwrap() {
                let (op, id, data) = (t[0].as_str().unwrap(), t[1].as_str().unwrap(), t[2].as_str().unwrap());
                if op == "w" { continue }
                let Some(ch) = p.channels.iter().position(|x| uuid(x.notify)[4..8] == *id) else { continue };
                at += 50;
                events.extend(d.receive(ch, &hex(data), at, &mut vec![]));
            }
            let moves: Vec<String> = events.iter().filter_map(|e| if let Event::Move { turn, .. } = e { Some(turn.clone()) } else { None }).collect();
            let want: Vec<String> = c["moves"].as_array().unwrap().iter().map(|m| m.as_str().unwrap().to_string()).collect();
            assert!(moves.ends_with(&want), "{name}: {moves:?}");
            assert_eq!(moves.len() - want.len(), if name == "WCU_MY33_AF9E" { 1 } else { 0 }, "{name}");
            assert!(events.iter().any(|e| matches!(e, Event::Facelets(f) if is_cube(f))), "{name}: no state");
            let times: Vec<i64> = events.iter().filter_map(|e| if let Event::Move { at, .. } = e { Some(*at) } else { None }).collect();
            assert!(times.windows(2).all(|w| w[0] <= w[1]), "{name}: times go back");
            if let Some(b) = c["battery"][0].as_u64() { assert!(events.contains(&Event::Battery(b as u8)), "{name}: battery") }
        }
    }

    #[test]
    fn reads_states_back() {
        let mut cube = crate::cube::Cube::solved(3);
        cube.apply("R U F' D2 L B'");
        let f = facelets_of(&cube);
        assert!(is_cube(&f));
        assert_eq!(facelets_of(&cube_of(&f)), f);
        assert_eq!(facelets_of(&crate::cube::Cube::solved(3)), SOLVED);
        // R from solved: U's right column takes F's colour.
        let mut r = crate::cube::Cube::solved(3);
        r.apply("R");
        assert_eq!(&facelets_of(&r)[..9], "UUFUUFUUF");
    }
}
