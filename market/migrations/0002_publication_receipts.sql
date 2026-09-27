-- Bounded recovery of an accepted publication after its public listing expires.
-- The digest commits the signed canonical public payload including its full domain.
CREATE INDEX publications_receipt ON publications(network,contract,digest);
