use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
};
pub struct Engine {
    child: Child,
    stdin: ChildStdin,
    next: u64,
    pub pending: HashMap<u64, String>,
}
impl Engine {
    pub fn start() -> anyhow::Result<(Self, async_channel::Receiver<Value>)> {
        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let exe = std::env::current_exe()?;
        let packaged = exe.parent().unwrap().join(if cfg!(target_os = "windows") {
            "cubix-engine.exe"
        } else {
            "cubix-engine"
        });
        let mut cmd = if packaged.exists() {
            Command::new(packaged)
        } else {
            let mut c = Command::new("bun");
            c.arg(base.join("bin/main.js"));
            c
        };
        let mut child = cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?;
        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, rx) = async_channel::unbounded();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(line) => {
                        if let Ok(value) = serde_json::from_str(&line) {
                            if tx.send_blocking(value).is_err() {
                                break;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
            let _ = tx.send_blocking(json!({"event":"engine-exit"}));
        });
        Ok((
            Self {
                child,
                stdin,
                next: 0,
                pending: HashMap::new(),
            },
            rx,
        ))
    }
    pub fn call(&mut self, key: &str, method: &str, args: Value) -> anyhow::Result<()> {
        self.next += 1;
        self.pending.insert(self.next, key.to_owned());
        writeln!(
            self.stdin,
            "{}",
            json!({"id":self.next,"method":method,"args":args})
        )?;
        self.stdin.flush()?;
        Ok(())
    }
}
impl Drop for Engine {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
