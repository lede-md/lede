use std::fs;
use std::path::Path;

pub fn read_to_string(path: &str) -> Result<String, String> {
    fs::read_to_string(Path::new(path)).map_err(|e| e.to_string())
}

pub fn write_string(path: &str, content: &str) -> Result<(), String> {
    fs::write(Path::new(path), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    read_to_string(&path)
}

#[tauri::command]
pub fn save_file(path: String, content: String) -> Result<(), String> {
    write_string(&path, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_roundtrip() {
        let dir = std::env::temp_dir();
        let path = dir.join("mdread_test_roundtrip.md");
        let p = path.to_str().unwrap();
        write_string(p, "# hello\n").unwrap();
        let got = read_to_string(p).unwrap();
        assert_eq!(got, "# hello\n");
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn read_missing_file_errors() {
        let res = read_to_string("/no/such/mdread/file.md");
        assert!(res.is_err());
    }
}
