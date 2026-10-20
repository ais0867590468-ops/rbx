alter table orders add column if not exists payment_method text not null default 'pix';
alter table orders add column if not exists card_brand text;
alter table orders add column if not exists card_last4 text;

update settings set value = 'RecargasBuxs' where key = 'site_name' and value in ('RecargaBux', '');
insert into settings (key, value) values ('site_name', 'RecargasBuxs')
on conflict (key) do nothing;
