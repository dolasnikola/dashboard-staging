-- FAZA 4A: Client onboarding automatizacija
-- Dodaje sort_order kolonu za dinamičko sortiranje klijenata (zamenjuje hardcoded preferredOrder)

ALTER TABLE clients ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 100;

-- Postavi redosled za postojeće klijente
UPDATE clients SET sort_order = 1 WHERE id = 'nlb';
UPDATE clients SET sort_order = 2 WHERE id = 'urban';
UPDATE clients SET sort_order = 3 WHERE id = 'krka';
