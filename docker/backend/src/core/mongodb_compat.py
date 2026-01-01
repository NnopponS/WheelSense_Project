"""
MongoDB Compatibility Layer for SQLite Database
Provides MongoDB-like interface for SQLite operations
"""

import json
from datetime import datetime
from typing import Any, Dict, List, Optional


class MongoDBCompatibleCollection:
    """Wrapper class that provides MongoDB-like interface for SQLite collections."""
    
    def __init__(self, db_connection, table_name: str, db_instance):
        self.db = db_connection
        self.table_name = table_name
        self.db_instance = db_instance
    
    def find(self, query: Dict = None):
        """MongoDB-like find operation."""
        return MongoDBCursor(self.db, self.table_name, query or {}, self.db_instance)
    
    async def find_one(self, query: Dict):
        """MongoDB-like find_one operation."""
        cursor = MongoDBCursor(self.db, self.table_name, query, self.db_instance)
        results = await cursor.to_list(length=1)
        return results[0] if results else None
    
    async def insert_one(self, document: Dict):
        """MongoDB-like insert_one operation."""
        # Generate ID if not present
        if 'id' not in document and '_id' not in document:
            import uuid
            document['id'] = str(uuid.uuid4())
            document['_id'] = document['id']
        elif 'id' in document and '_id' not in document:
            document['_id'] = document['id']
        elif '_id' in document and 'id' not in document:
            document['id'] = document['_id']
        
        # Convert dict/list fields to JSON
        def to_json(value):
            if isinstance(value, (dict, list)):
                return json.dumps(value)
            return value
        
        # Build INSERT statement dynamically
        fields = list(document.keys())
        placeholders = ','.join(['?' for _ in fields])
        field_names = ','.join(fields)
        
        values = [to_json(document[f]) if isinstance(document[f], (dict, list)) else document[f] for f in fields]
        
        sql = f"INSERT INTO {self.table_name} ({field_names}) VALUES ({placeholders})"
        cursor = await self.db.execute(sql, values)
        await self.db.commit()
        
        # Return result object
        return type('InsertOneResult', (), {'inserted_id': document.get('_id')})()
    
    async def update_one(self, query: Dict, update: Dict, upsert: bool = False):
        """MongoDB-like update_one operation."""
        # Parse update operators
        set_fields = update.get('$set', {})
        
        if not set_fields:
            return type('UpdateResult', (), {'matched_count': 0, 'modified_count': 0})()
        
        # Build WHERE clause
        where_clause, where_params = self._build_where_clause(query)
        
        # Build SET clause
        set_parts = []
        set_params = []
        for key, value in set_fields.items():
            set_parts.append(f"{key} = ?")
            if isinstance(value, (dict, list)):
                set_params.append(json.dumps(value))
            elif isinstance(value, bool):
                set_params.append(1 if value else 0)
            elif isinstance(value, datetime):
                set_params.append(value.isoformat())
            else:
                set_params.append(value)
        
        set_clause = ', '.join(set_parts)
        sql = f"UPDATE {self.table_name} SET {set_clause} WHERE {where_clause}"
        
        cursor = await self.db.execute(sql, set_params + where_params)
        await self.db.commit()
        
        matched_count = cursor.rowcount
        
        # Handle upsert if no rows were updated
        if upsert and matched_count == 0:
            # Insert new document
            new_doc = {**query, **set_fields}
            await self.insert_one(new_doc)
            return type('UpdateResult', (), {'matched_count': 0, 'modified_count': 0, 'upserted_id': new_doc.get('_id')})()
        
        return type('UpdateResult', (), {'matched_count': matched_count, 'modified_count': matched_count})()
    
    async def update_many(self, query: Dict, update: Dict):
        """MongoDB-like update_many operation."""
        # Parse update operators
        set_fields = update.get('$set', {})
        
        if not set_fields:
            return type('UpdateResult', (), {'matched_count': 0, 'modified_count': 0})()
        
        # Build WHERE clause
        where_clause, where_params = self._build_where_clause(query)
        
        # Build SET clause
        set_parts = []
        set_params = []
        for key, value in set_fields.items():
            set_parts.append(f"{key} = ?")
            if isinstance(value, (dict, list)):
                set_params.append(json.dumps(value))
            elif isinstance(value, bool):
                set_params.append(1 if value else 0)
            elif isinstance(value, datetime):
                set_params.append(value.isoformat())
            else:
                set_params.append(value)
        
        set_clause = ', '.join(set_parts)
        sql = f"UPDATE {self.table_name} SET {set_clause} WHERE {where_clause}"
        
        cursor = await self.db.execute(sql, set_params + where_params)
        await self.db.commit()
        
        return type('UpdateResult', (), {'matched_count': cursor.rowcount, 'modified_count': cursor.rowcount})()
    
    async def delete_one(self, query: Dict):
        """MongoDB-like delete_one operation."""
        where_clause, where_params = self._build_where_clause(query)
        sql = f"DELETE FROM {self.table_name} WHERE {where_clause} LIMIT 1"
        
        cursor = await self.db.execute(sql, where_params)
        await self.db.commit()
        
        return type('DeleteResult', (), {'deleted_count': cursor.rowcount})()
    
    async def delete_many(self, query: Dict):
        """MongoDB-like delete_many operation."""
        where_clause, where_params = self._build_where_clause(query)
        sql = f"DELETE FROM {self.table_name} WHERE {where_clause}"
        
        cursor = await self.db.execute(sql, where_params)
        await self.db.commit()
        
        return type('DeleteResult', (), {'deleted_count': cursor.rowcount})()
    
    async def count_documents(self, query: Dict = None):
        """MongoDB-like count_documents operation."""
        if query:
            where_clause, where_params = self._build_where_clause(query)
            sql = f"SELECT COUNT(*) FROM {self.table_name} WHERE {where_clause}"
            async with self.db.execute(sql, where_params) as cursor:
                row = await cursor.fetchone()
                return row[0] if row else 0
        else:
            sql = f"SELECT COUNT(*) FROM {self.table_name}"
            async with self.db.execute(sql) as cursor:
                row = await cursor.fetchone()
                return row[0] if row else 0
    
    def _build_where_clause(self, query: Dict):
        """Build SQL WHERE clause from MongoDB query."""
        if not query:
            return "1=1", []
        
        conditions = []
        params = []
        
        for key, value in query.items():
            if key == "$or":
                # Handle $or operator
                or_conditions = []
                for or_query in value:
                    or_clause, or_params = self._build_where_clause(or_query)
                    or_conditions.append(f"({or_clause})")
                    params.extend(or_params)
                conditions.append(f"({' OR '.join(or_conditions)})")
            elif isinstance(value, dict):
                # Handle operators like $in, $gte, etc.
                for op, op_value in value.items():
                    if op == "$in":
                        placeholders = ','.join(['?' for _ in op_value])
                        conditions.append(f"{key} IN ({placeholders})")
                        params.extend(op_value)
                    elif op == "$gte":
                        conditions.append(f"{key} >= ?")
                        params.append(op_value)
                    elif op == "$lte":
                        conditions.append(f"{key} <= ?")
                        params.append(op_value)
                    elif op == "$ne":
                        conditions.append(f"{key} != ?")
                        params.append(op_value)
            else:
                conditions.append(f"{key} = ?")
                params.append(value)
        
        where_clause = ' AND '.join(conditions) if conditions else "1=1"
        return where_clause, params


class MongoDBCursor:
    """Cursor class that mimics MongoDB cursor."""
    
    def __init__(self, db_connection, table_name: str, query: Dict, db_instance):
        self.db = db_connection
        self.table_name = table_name
        self.query = query
        self.db_instance = db_instance
        self.sort_field = None
        self.sort_direction = 1
        self.limit_value = None
    
    def sort(self, field: str, direction: int = 1):
        """Add sorting to cursor."""
        self.sort_field = field
        self.sort_direction = direction
        return self
    
    def limit(self, count: int):
        """Add limit to cursor."""
        self.limit_value = count
        return self
    
    async def to_list(self, length: int = None):
        """Execute query and return list of documents."""
        # Build WHERE clause
        collection = MongoDBCompatibleCollection(self.db, self.table_name, self.db_instance)
        where_clause, where_params = collection._build_where_clause(self.query)
        
        # Build SQL query
        sql = f"SELECT * FROM {self.table_name} WHERE {where_clause}"
        
        # Add sorting
        if self.sort_field:
            direction = "DESC" if self.sort_direction == -1 else "ASC"
            sql += f" ORDER BY {self.sort_field} {direction}"
        
        # Add limit
        limit = self.limit_value or length
        if limit:
            sql += f" LIMIT {limit}"
        
        # Execute query
        async with self.db.execute(sql, where_params) as cursor:
            rows = await cursor.fetchall()
            return [self.db_instance._serialize_doc(row) for row in rows]


class MongoDBCompatibilityLayer:
    """Provides db.db.{collection} interface for SQLite."""
    
    def __init__(self, db_connection, db_instance):
        self.db_connection = db_connection
        self.db_instance = db_instance
        self._collections = {}
    
    def __getattr__(self, name):
        """Return a collection wrapper for any attribute access."""
        if name not in self._collections:
            self._collections[name] = MongoDBCompatibleCollection(
                self.db_connection, name, self.db_instance
            )
        return self._collections[name]
