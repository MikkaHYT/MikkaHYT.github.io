#!/usr/bin/env python3
"""
Database migration script to add microsoft_id column to the user table.
"""

import sqlite3
from pathlib import Path

def migrate_database():
    """Add microsoft_id column to existing database if it doesn't exist."""
    
    # Database path
    db_path = Path('./instance/timetable.db')
    
    if not db_path.exists():
        print("No existing database found. Please run the app first to create the database.")
        return
    
    print("Migrating database for Microsoft Sign-In...")
    
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    try:
        # Check if microsoft_id column exists
        cursor.execute("PRAGMA table_info(user)")
        columns = [column[1] for column in cursor.fetchall()]
        print(f"Existing columns in user table: {columns}")
        
        if 'microsoft_id' not in columns:
            print("Adding microsoft_id column...")
            cursor.execute("ALTER TABLE user ADD COLUMN microsoft_id TEXT")
            print("✓ microsoft_id column added")
        else:
            print("✓ microsoft_id column already exists")
            
        conn.commit()
        print("Migration completed successfully!")
        
    except sqlite3.Error as e:
        print(f"Database error during migration: {e}")
        conn.rollback()
        raise e
    
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()
