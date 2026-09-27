-- Public signed discovery data only. No accounts, wallet secrets, private notes or customer GPS.
CREATE TABLE publications (
 network TEXT NOT NULL, contract TEXT NOT NULL, offer_key TEXT NOT NULL,
 seller TEXT NOT NULL, key_epoch INTEGER NOT NULL CHECK(key_epoch > 0),
 revision INTEGER NOT NULL CHECK(revision > 0), nonce TEXT NOT NULL,
 digest TEXT NOT NULL, expires_at INTEGER NOT NULL, metadata_hash TEXT NOT NULL,
 shop_id TEXT NOT NULL, lat_e6 INTEGER NOT NULL, lon_e6 INTEGER NOT NULL,
 record_json TEXT NOT NULL,
 PRIMARY KEY(network, contract, offer_key, revision),
 UNIQUE(network, contract, seller, key_epoch, nonce)
) STRICT;
CREATE TABLE listings (
 network TEXT NOT NULL, contract TEXT NOT NULL, offer_key TEXT NOT NULL,
 seller TEXT NOT NULL, revision INTEGER NOT NULL, digest TEXT NOT NULL, expires_at INTEGER NOT NULL,
 metadata_hash TEXT NOT NULL, shop_id TEXT NOT NULL, lat_e6 INTEGER NOT NULL,
 lon_e6 INTEGER NOT NULL, record_json TEXT NOT NULL,
 PRIMARY KEY(network, contract, offer_key)
) STRICT;
CREATE INDEX listings_geo ON listings(network,contract,lat_e6,lon_e6);
CREATE INDEX listings_shop ON listings(network,contract,seller,shop_id,offer_key);
-- Checks run in the same SQLite statement transaction as the insertion. Races cannot
-- admit conflicting revisions or consume a nonce without publishing the corresponding record.
CREATE TRIGGER publication_revision BEFORE INSERT ON publications BEGIN
 SELECT RAISE(ABORT,'catalog_revision_conflict') WHERE NEW.revision != COALESCE((SELECT revision + 1 FROM listings
   WHERE network=NEW.network AND contract=NEW.contract AND offer_key=NEW.offer_key),1);
 SELECT RAISE(ABORT,'catalog_metadata_conflict') WHERE EXISTS(SELECT 1 FROM listings WHERE network=NEW.network AND contract=NEW.contract
   AND offer_key=NEW.offer_key AND metadata_hash != NEW.metadata_hash);
END;
CREATE TRIGGER publication_current AFTER INSERT ON publications BEGIN
 INSERT INTO listings(network,contract,offer_key,seller,revision,digest,expires_at,metadata_hash,shop_id,lat_e6,lon_e6,record_json)
 VALUES(NEW.network,NEW.contract,NEW.offer_key,NEW.seller,NEW.revision,NEW.digest,NEW.expires_at,NEW.metadata_hash,NEW.shop_id,NEW.lat_e6,NEW.lon_e6,NEW.record_json)
 ON CONFLICT(network,contract,offer_key) DO UPDATE SET revision=excluded.revision,digest=excluded.digest,
 expires_at=excluded.expires_at,record_json=excluded.record_json;
END;
