ALTER TABLE videos ADD CONSTRAINT videos_project_id_unique UNIQUE (project_id);

ALTER TABLE analysis_chunks ADD CONSTRAINT analysis_chunks_project_chunk_unique UNIQUE (project_id, chunk_index);

ALTER TABLE projects ADD CONSTRAINT projects_delivery_target_check CHECK (delivery_target IS NULL OR delivery_target IN ('streaming', 'broadcast', 'cable', 'cable_vod', 'ott', 'social'));