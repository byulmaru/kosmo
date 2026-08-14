GRANT USAGE ON SCHEMA public TO kosmo_api, kosmo_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kosmo_api, kosmo_worker;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE kosmo IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kosmo_api, kosmo_worker;
