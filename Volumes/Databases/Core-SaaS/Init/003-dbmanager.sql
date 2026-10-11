INSERT INTO core_application(application_code,application_name,application_description,application_icon_svg,application_type,route_prefix)
VALUES ('core-database-management','Core Database Management','Maintain tenant database connections and generate PostgreSQL migration scripts.',
 '<svg viewBox="0 0 48 48" role="img" aria-label="Database Management"><ellipse class="app-icon-stroke" cx="24" cy="11" rx="15" ry="6"/><path class="app-icon-line" d="M9 11v26c0 8 30 8 30 0V11M9 23c0 8 30 8 30 0"/></svg>',
 'public_application','/dbmanager')
ON CONFLICT(application_code) DO UPDATE SET application_name=excluded.application_name,
 application_description=excluded.application_description,application_icon_svg=excluded.application_icon_svg,
 application_type=excluded.application_type,route_prefix=excluded.route_prefix,updated_at=now();
