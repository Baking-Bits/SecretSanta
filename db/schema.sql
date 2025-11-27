-- SQL schema for Secret Santa app (Postgres)

-- SQL schema for Secret Santa app (MySQL / MariaDB)

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title TEXT NOT NULL,
  link TEXT,
  is_recommended BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Family profiles (people who will be claimed for Secret Santa)
CREATE TABLE IF NOT EXISTS profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL UNIQUE,
  partner_profile_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_profile_id) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Claims map a profile -> app user (one-to-one)
CREATE TABLE IF NOT EXISTS claims (
  profile_id INT NOT NULL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert the family profiles (id order doesn't matter; partner links set after)
INSERT IGNORE INTO profiles (name) VALUES
  ('Patrick'),
  ('Danielle'),
  ('Susan'),
  ('Ethan'),
  ('Chris'),
  ('Amy'),
  ('Scott');

-- Set partner relationships by name
UPDATE profiles p
  JOIN profiles p2 ON p2.name = 'Danielle'
  SET p.partner_profile_id = p2.id
  WHERE p.name = 'Patrick';

UPDATE profiles p
  JOIN profiles p2 ON p2.name = 'Patrick'
  SET p.partner_profile_id = p2.id
  WHERE p.name = 'Danielle';

UPDATE profiles p
  JOIN profiles p2 ON p2.name = 'Ethan'
  SET p.partner_profile_id = p2.id
  WHERE p.name = 'Susan';

UPDATE profiles p
  JOIN profiles p2 ON p2.name = 'Susan'
  SET p.partner_profile_id = p2.id
  WHERE p.name = 'Ethan';

UPDATE profiles p
  JOIN profiles p2 ON p2.name = 'Chris'
  SET p.partner_profile_id = p2.id
  WHERE p.name = 'Amy';

UPDATE profiles p
  JOIN profiles p2 ON p2.name = 'Amy'
  SET p.partner_profile_id = p2.id
  WHERE p.name = 'Chris';

-- Favorites: allow any app user to favourite an item
CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_item_user (item_id, user_id),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Assignments: store Secret Santa assignments (giver -> recipient_profile)
CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  -- either `giver_user_id` (if the profile was claimed) OR `giver_profile_id` (if unclaimed)
  giver_user_id INT DEFAULT NULL,
  giver_profile_id INT DEFAULT NULL,
  recipient_profile_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (giver_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (giver_profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Ensure uniqueness so a giver (by user or by profile) only appears once
-- If the assignments table existed from before, ensure the new column exists before adding index
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS giver_profile_id INT DEFAULT NULL;
ALTER TABLE assignments ADD UNIQUE INDEX IF NOT EXISTS uniq_giver_user (giver_user_id);
ALTER TABLE assignments ADD UNIQUE INDEX IF NOT EXISTS uniq_giver_profile (giver_profile_id);
ALTER TABLE assignments MODIFY giver_user_id INT NULL;
ALTER TABLE assignments MODIFY giver_profile_id INT NULL;
