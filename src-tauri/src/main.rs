#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};

struct MonitorState(Mutex<Option<mpsc::Sender<()>>>);

#[tauri::command]
fn start_background_monitor(app: AppHandle, state: State<'_, MonitorState>, interval_ms: u64) -> Result<(), String> {
    if interval_ms < 1_000 {
        return Err("Monitor interval must be at least one second.".to_string());
    }
    let (sender, receiver) = mpsc::channel();
    let mut active = state.0.lock().map_err(|_| "Monitor state is unavailable.".to_string())?;
    if let Some(previous) = active.replace(sender) {
        let _ = previous.send(());
    }
    thread::spawn(move || {
        loop {
            match receiver.recv_timeout(Duration::from_millis(interval_ms)) {
                Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if app.emit("vectoris://monitor-tick", ()).is_err() {
                        break;
                    }
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn stop_background_monitor(state: State<'_, MonitorState>) -> Result<(), String> {
    let mut active = state.0.lock().map_err(|_| "Monitor state is unavailable.".to_string())?;
    if let Some(sender) = active.take() {
        let _ = sender.send(());
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(MonitorState(Mutex::new(None)))
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![start_background_monitor, stop_background_monitor])
        .run(tauri::generate_context!())
        .expect("error while running Vectoris")
}
