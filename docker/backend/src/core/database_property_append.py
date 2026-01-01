        await self._db_connection.commit()
        return cursor.rowcount > 0
    
    # ==================== MongoDB Compatibility Layer ====================
    
    @property
    def db(self):
        """Expose MongoDB-compatible interface via db.db.{collection}."""
        if not self._compat_layer:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self._compat_layer
