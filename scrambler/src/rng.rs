/// A small fast generator (wyrand), seeded by its caller.
pub struct Rng(u64);

impl Rng {
    pub const fn new(seed: u64) -> Rng { Rng(seed) }

    pub fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0xa0761d6478bd642f);
        let t = (self.0 as u128) * ((self.0 ^ 0xe7037ed1a0b428db) as u128);
        (t >> 64) as u64 ^ t as u64
    }

    /// Uniform in 0..n.
    pub fn below(&mut self, n: usize) -> usize { ((self.next() as u128 * n as u128) >> 64) as usize }

    pub fn pick<'a, T>(&mut self, values: &'a [T]) -> &'a T { &values[self.below(values.len())] }

    pub fn shuffle(&mut self, p: &mut [u8]) {
        for i in (1..p.len()).rev() {
            p.swap(i, self.below(i + 1));
        }
    }

    /// Random orientations, the last one making their sum a multiple of `n`.
    pub fn twists(&mut self, o: &mut [u8], n: u8) {
        let last = o.len() - 1;
        let mut sum = 0;
        for x in &mut o[..last] {
            *x = self.below(n as usize) as u8;
            sum += *x;
        }
        o[last] = (n - sum % n) % n;
    }
}
