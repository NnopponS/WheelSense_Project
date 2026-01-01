    # ==================== MongoDB Compatibility Layer ====================
    
    @property
    def db(self):
        """Expose MongoDB-compatible interface via db.db.{collection}."""
        return self._compat_layer
