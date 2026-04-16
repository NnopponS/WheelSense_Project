"""Verify that tasks tables were created successfully."""
from sqlalchemy import create_engine, text, inspect
from app.config import settings


def verify_tables():
    """Check if tasks and task_reports tables exist."""
    engine = create_engine(settings.database_url_sync)
    
    with engine.connect() as conn:
        # Check if tables exist
        result = conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('tasks', 'task_reports')
            ORDER BY table_name
        """))
        tables = [row[0] for row in result.fetchall()]
        print(f"✅ Created tables: {tables}")
        
        inspector = inspect(engine)
        
        if 'tasks' in tables:
            # Get columns
            columns = inspector.get_columns('tasks')
            print("\n📋 tasks table columns:")
            for col in columns:
                nullable = "NULL" if col['nullable'] else "NOT NULL"
                print(f"  - {col['name']}: {col['type']} ({nullable})")
            
            # Get indexes
            indexes = inspector.get_indexes('tasks')
            print("\n📊 tasks table indexes:")
            for idx in indexes:
                print(f"  - {idx['name']} (unique: {idx['unique']})")
        
        if 'task_reports' in tables:
            # Get columns
            columns = inspector.get_columns('task_reports')
            print("\n📋 task_reports table columns:")
            for col in columns:
                nullable = "NULL" if col['nullable'] else "NOT NULL"
                print(f"  - {col['name']}: {col['type']} ({nullable})")
            
            # Get indexes
            indexes = inspector.get_indexes('task_reports')
            print("\n📊 task_reports table indexes:")
            for idx in indexes:
                print(f"  - {idx['name']} (unique: {idx['unique']})")
        
        print("\n✅ Migration verification complete!")


if __name__ == "__main__":
    verify_tables()
