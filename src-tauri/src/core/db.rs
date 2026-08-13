use sqlx::{sqlite::{SqliteConnectOptions, SqlitePoolOptions}, SqlitePool};
use std::str::FromStr;
use std::fs;
use tauri::Manager;

pub async fn init_db(app_handle: &tauri::AppHandle) -> Result<SqlitePool, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    let db_path = app_dir.join("srt_app.db");
    let db_url = format!("sqlite:{}", db_path.to_string_lossy());
    
    let options = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| e.to_string())?
        .create_if_missing(true);
        
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| e.to_string())?;
        
    // Create tables
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS translation_memory (
            hash TEXT PRIMARY KEY,
            source_lang TEXT NOT NULL,
            target_lang TEXT NOT NULL,
            source_text TEXT NOT NULL,
            target_text TEXT NOT NULL,
            approved BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );"
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create TM table: {}", e))?;
    
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS context_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            embedding BLOB NOT NULL
        );"
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create context_embeddings table: {}", e))?;
    
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dictionary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lang TEXT NOT NULL,
            source TEXT NOT NULL,
            translation TEXT NOT NULL,
            category TEXT NOT NULL
        );"
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create dictionary table: {}", e))?;
    
    Ok(pool)
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TMEntry {
    pub hash: String,
    pub source_lang: String,
    pub target_lang: String,
    pub source_text: String,
    pub target_text: String,
}

pub async fn insert_tm_entry(pool: &SqlitePool, entry: TMEntry) -> Result<(), String> {
    sqlx::query(
        "INSERT OR REPLACE INTO translation_memory (hash, source_lang, target_lang, source_text, target_text) 
         VALUES (?, ?, ?, ?, ?)"
    )
    .bind(entry.hash)
    .bind(entry.source_lang)
    .bind(entry.target_lang)
    .bind(entry.source_text)
    .bind(entry.target_text)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn find_tm_match(pool: &SqlitePool, hash: &str) -> Result<Option<String>, String> {
    let result = sqlx::query_as::<_, (String,)>("SELECT target_text FROM translation_memory WHERE hash = ?")
        .bind(hash)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
        
    Ok(result.map(|r| r.0))
}

pub async fn insert_context_embedding(pool: &SqlitePool, text: &str, embedding: Vec<f32>) -> Result<(), String> {
    let embedding_bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_ne_bytes()).collect();
    sqlx::query("INSERT INTO context_embeddings (text, embedding) VALUES (?, ?)")
        .bind(text)
        .bind(embedding_bytes)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_all_context_embeddings(pool: &SqlitePool) -> Result<Vec<(String, Vec<f32>)>, String> {
    let rows = sqlx::query_as::<_, (String, Vec<u8>)>("SELECT text, embedding FROM context_embeddings")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let mut results = Vec::new();
    for row in rows {
        let text = row.0;
        let bytes = row.1;
        let mut embedding = Vec::new();
        for chunk in bytes.chunks_exact(4) {
            let f = f32::from_ne_bytes(chunk.try_into().unwrap());
            embedding.push(f);
        }
        results.push((text, embedding));
    }
    
    Ok(results)
}
