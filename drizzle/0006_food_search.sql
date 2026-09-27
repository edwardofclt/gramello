-- Additive index: canonical nutrition rows remain in foods.
CREATE VIRTUAL TABLE IF NOT EXISTS food_search USING fts5(name, brand, content='foods', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS foods_search_insert AFTER INSERT ON foods BEGIN
  INSERT INTO food_search(rowid,name,brand) VALUES(new.rowid,new.name,coalesce(new.brand,''));
END;
CREATE TRIGGER IF NOT EXISTS foods_search_delete AFTER DELETE ON foods BEGIN
  INSERT INTO food_search(food_search,rowid,name,brand) VALUES('delete',old.rowid,old.name,coalesce(old.brand,''));
END;
CREATE TRIGGER IF NOT EXISTS foods_search_update AFTER UPDATE ON foods BEGIN
  INSERT INTO food_search(food_search,rowid,name,brand) VALUES('delete',old.rowid,old.name,coalesce(old.brand,''));
  INSERT INTO food_search(rowid,name,brand) VALUES(new.rowid,new.name,coalesce(new.brand,''));
END;
INSERT INTO food_search(food_search) VALUES('rebuild');
-- A single atomic reservation per provider protects a deployment's shared egress.
CREATE TABLE IF NOT EXISTS food_provider_quota(provider TEXT PRIMARY KEY,next_allowed_at INTEGER NOT NULL);
