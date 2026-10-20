-- Remove the 800 Robux package from the store (kept inactive so old orders keep their link).
update products set active = false where slug = '800-robux';
