-- Up Migration
-- La biblioteca pregunta en qué fechas está programada cada pieza: sin índice sería un recorrido completo.
CREATE INDEX idx_scheduled_posts_content ON scheduled_posts (content_item_id);
-- Down Migration
DROP INDEX idx_scheduled_posts_content;
