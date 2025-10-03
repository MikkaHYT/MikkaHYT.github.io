#!/usr/bin/env python3
"""
Database migration script to add new time slot columns to existing timetables.
Run this script if you have existing timetable data that needs the new fields.
"""

import sqlite3
import json
import os
from pathlib import Path

def migrate_database():
    """Add new columns to existing database if they don't exist."""
    
    # Database path
    db_path = Path('./instance/timetable.db')
    
    if not db_path.exists():
        print("No existing database found. New database will be created with all fields.")
        return
    
    print("Migrating existing database...")
    
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    try:
        # Check if new columns exist
        cursor.execute("PRAGMA table_info(timetable)")
        columns = [column[1] for column in cursor.fetchall()]
        print(f"Existing columns: {columns}")
        
        # Add time_slot_mode column if it doesn't exist
        if 'time_slot_mode' not in columns:
            print("Adding time_slot_mode column...")
            cursor.execute("ALTER TABLE timetable ADD COLUMN time_slot_mode BOOLEAN DEFAULT 1")
            print("✓ time_slot_mode column added")
        else:
            print("✓ time_slot_mode column already exists")
        
        # Add time_slot_settings column if it doesn't exist
        if 'time_slot_settings' not in columns:
            print("Adding time_slot_settings column...")
            cursor.execute("ALTER TABLE timetable ADD COLUMN time_slot_settings TEXT DEFAULT '{}'")
            print("✓ time_slot_settings column added")
        else:
            print("✓ time_slot_settings column already exists")
        
        # Add notes_data column if it doesn't exist
        if 'notes_data' not in columns:
            print("Adding notes_data column...")
            cursor.execute("ALTER TABLE timetable ADD COLUMN notes_data TEXT DEFAULT '{}'")
            print("✓ notes_data column added")
        else:
            print("✓ notes_data column already exists")
        
        # Add study_time_data column if it doesn't exist
        if 'study_time_data' not in columns:
            print("Adding study_time_data column...")
            cursor.execute("ALTER TABLE timetable ADD COLUMN study_time_data TEXT DEFAULT '{}'")
            print("✓ study_time_data column added")
        else:
            print("✓ study_time_data column already exists")

        # Add color_library column if it doesn't exist
        if 'color_library' not in columns:
            print("Adding color_library column...")
            cursor.execute("ALTER TABLE timetable ADD COLUMN color_library TEXT DEFAULT '[]'")
            print("✓ color_library column added")
        else:
            print("✓ color_library column already exists")
        
        # Update existing timetables with default time slot settings
        default_settings = {
            'start_time': '9:00',
            'slot_duration': 60,
            'break_duration': 15,
            'lunch_break': {'start': '12:30', 'duration': 60},
            'time_format': '24h'
        }
        
        # Check if any timetables have empty or null time_slot_settings
        cursor.execute("SELECT COUNT(*) FROM timetable WHERE time_slot_settings IS NULL OR time_slot_settings = '' OR time_slot_settings = '{}'")
        count = cursor.fetchone()[0]
        
        if count > 0:
            print(f"Updating {count} timetables with default time slot settings...")
            cursor.execute("UPDATE timetable SET time_slot_settings = ? WHERE time_slot_settings IS NULL OR time_slot_settings = '' OR time_slot_settings = '{}'", 
                          (json.dumps(default_settings),))
            print("✓ Default time slot settings applied")
        
        # Initialize notes_data for existing timetables
        cursor.execute("SELECT COUNT(*) FROM timetable WHERE notes_data IS NULL OR notes_data = '' OR notes_data = '{}'")
        notes_count = cursor.fetchone()[0]
        
        if notes_count > 0:
            print(f"Initializing notes_data for {notes_count} timetables...")
            default_notes = {
                'general': '',
                'study': '',
                'todos': []
            }
            cursor.execute("UPDATE timetable SET notes_data = ? WHERE notes_data IS NULL OR notes_data = '' OR notes_data = '{}'",
                          (json.dumps(default_notes),))
            print("✓ Default notes data initialized")
        
        # Initialize study_time_data for existing timetables
        cursor.execute("SELECT COUNT(*) FROM timetable WHERE study_time_data IS NULL OR study_time_data = '' OR study_time_data = '{}'")
        study_count = cursor.fetchone()[0]
        
        if study_count > 0:
            print(f"Initializing study_time_data for {study_count} timetables...")
            default_study_time = {
                'totalTimeAllTime': 0,
                'lastSessionDate': None
            }
            cursor.execute("UPDATE timetable SET study_time_data = ? WHERE study_time_data IS NULL OR study_time_data = '' OR study_time_data = '{}'",
                          (json.dumps(default_study_time),))
            print("✓ Default study time data initialized")

        # Initialize color_library for existing timetables
        cursor.execute("SELECT COUNT(*) FROM timetable WHERE color_library IS NULL OR color_library = ''")
        color_count = cursor.fetchone()[0]

        if color_count > 0:
            print(f"Initializing color_library for {color_count} timetables...")
            cursor.execute("UPDATE timetable SET color_library = '[]' WHERE color_library IS NULL OR color_library = ''")
            print("✓ Default color library initialized")
        
        # Update row and column headers for existing timetables to match new format
        cursor.execute("SELECT id, row_headers, column_headers FROM timetable")
        timetables = cursor.fetchall()
        
        updated_count = 0
        for timetable_id, row_headers_json, column_headers_json in timetables:
            try:
                row_headers = json.loads(row_headers_json) if row_headers_json else []
                column_headers = json.loads(column_headers_json) if column_headers_json else []
                
                # Check if this looks like old format (periods as columns)
                if any('Period' in str(header) for header in column_headers):
                    print(f"Converting timetable {timetable_id} from old format...")
                    
                    # Convert to time/day format
                    new_row_headers = ['9:00 - 10:00', '10:15 - 11:15', '11:30 - 12:30', '13:30 - 14:30', '14:45 - 15:45']
                    new_column_headers = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
                    
                    cursor.execute(
                        "UPDATE timetable SET row_headers = ?, column_headers = ? WHERE id = ?",
                        (json.dumps(new_row_headers), json.dumps(new_column_headers), timetable_id)
                    )
                    updated_count += 1
            
            except json.JSONDecodeError:
                print(f"Warning: Could not parse headers for timetable {timetable_id}")
                continue
        
        if updated_count > 0:
            print(f"✓ Converted {updated_count} timetables to new format")
        
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
