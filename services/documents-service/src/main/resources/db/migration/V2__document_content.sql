-- Real document storage (upload/download): records the filename the file was
-- uploaded under so a download can offer it back in Content-Disposition. The
-- bytes stay out of the database — storage_key still points at the blob in
-- volume-backed storage, which the service now writes and reads itself.
-- Nullable: rows created before this migration hold metadata for blobs this
-- service never received, and keep working (their content endpoint 404s).
-- Additive only; no existing column or constraint is touched.
alter table document add column original_filename varchar(255);

-- The documents list is paged and filtered by category, owner and creation
-- order; owner+category already have indexes, this one backs the default sort.
create index ix_document_created_at on document (created_at);
