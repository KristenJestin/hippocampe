--
-- PostgreSQL database dump
--


-- Dumped from database version 18.0 (Debian 18.0-1.pgdg13+3)
-- Dumped by pg_dump version 18.0 (Debian 18.0-1.pgdg13+3)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: hippocampe_simple; Type: TEXT SEARCH CONFIGURATION; Schema: public; Owner: -
--

CREATE TEXT SEARCH CONFIGURATION public.hippocampe_simple (
    PARSER = pg_catalog."default" );

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR asciiword WITH public.unaccent, simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR word WITH public.unaccent, simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR numword WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR email WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR url WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR host WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR sfloat WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR version WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR hword_numpart WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR hword_part WITH public.unaccent, simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR hword_asciipart WITH public.unaccent, simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR numhword WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR asciihword WITH public.unaccent, simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR hword WITH public.unaccent, simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR url_path WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR file WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR "float" WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR "int" WITH simple;

ALTER TEXT SEARCH CONFIGURATION public.hippocampe_simple
    ADD MAPPING FOR uint WITH simple;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint,
    name text,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: auth_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_account (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: auth_apikey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_apikey (
    id text NOT NULL,
    "configId" text NOT NULL,
    name text,
    start text,
    "referenceId" text NOT NULL,
    prefix text,
    key text NOT NULL,
    "refillInterval" integer,
    "refillAmount" integer,
    "lastRefillAt" timestamp with time zone,
    enabled boolean,
    "rateLimitEnabled" boolean,
    "rateLimitTimeWindow" integer,
    "rateLimitMax" integer,
    "requestCount" integer,
    remaining integer,
    "lastRequest" timestamp with time zone,
    "expiresAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    permissions text,
    metadata text
);


--
-- Name: auth_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_session (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL
);


--
-- Name: auth_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_user (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: auth_verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entries (
    id uuid DEFAULT uuidv7() NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    created timestamp with time zone DEFAULT now() NOT NULL,
    updated timestamp with time zone DEFAULT now() NOT NULL,
    valid_from date,
    valid_until date,
    superseded_by uuid,
    archived_at timestamp with time zone,
    search_language regconfig DEFAULT 'simple'::regconfig NOT NULL,
    media_text text DEFAULT ''::text NOT NULL,
    search tsvector GENERATED ALWAYS AS (((setweight(to_tsvector(search_language, ((title || ' '::text) || (aliases)::text)), 'A'::"char") || setweight(to_tsvector(search_language, (((tags)::text || ' '::text) || summary)), 'B'::"char")) || setweight(to_tsvector(search_language, ((body || ' '::text) || media_text)), 'C'::"char"))) STORED,
    sources jsonb DEFAULT '[]'::jsonb NOT NULL,
    archived_reason text
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    actor text NOT NULL,
    entry_id uuid,
    type_name text,
    action text NOT NULL,
    changes jsonb NOT NULL,
    CONSTRAINT events_check CHECK (((entry_id IS NULL) <> (type_name IS NULL)))
);


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: finding_occurrences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finding_occurrences (
    id bigint NOT NULL,
    finding integer NOT NULL,
    at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    origin text NOT NULL,
    title text NOT NULL,
    severity text NOT NULL,
    trying text NOT NULL,
    happened text NOT NULL,
    expected text NOT NULL,
    steps text DEFAULT ''::text NOT NULL,
    instance text NOT NULL,
    version text NOT NULL,
    commit text NOT NULL,
    key_name text,
    call_tool text,
    call_arguments text,
    CONSTRAINT finding_occurrences_origin CHECK ((origin = ANY (ARRAY['agent'::text, 'server'::text])))
);


--
-- Name: finding_occurrences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.finding_occurrences ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.finding_occurrences_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: findings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.findings (
    number integer NOT NULL,
    title text NOT NULL,
    kind text NOT NULL,
    place text NOT NULL,
    severity text NOT NULL,
    occurrences integer DEFAULT 1 NOT NULL,
    first_seen timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    last_seen timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    merged_into integer,
    CONSTRAINT findings_kind CHECK ((kind = ANY (ARRAY['bug'::text, 'tool_error'::text, 'unclear_refusal'::text, 'missing_capability'::text, 'wrong_state'::text, 'slow'::text, 'model_friction'::text, 'other'::text]))),
    CONSTRAINT findings_severity CHECK ((severity = ANY (ARRAY['blocks'::text, 'hurts'::text, 'cosmetic'::text])))
);


--
-- Name: findings_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.findings ALTER COLUMN number ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.findings_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: heads_up; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.heads_up (
    actor text NOT NULL,
    entry_id uuid NOT NULL,
    field text NOT NULL,
    period text NOT NULL,
    day date NOT NULL
);


--
-- Name: inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox (
    id uuid DEFAULT uuidv7() NOT NULL,
    kind text NOT NULL,
    name text,
    content text,
    sha256 text,
    size integer,
    origin text DEFAULT ''::text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    taken_by text,
    taken_at timestamp with time zone,
    closed_by text,
    closed_at timestamp with time zone,
    reason text,
    mime text,
    CONSTRAINT inbox_kind CHECK ((kind = ANY (ARRAY['text'::text, 'url'::text, 'file'::text]))),
    CONSTRAINT inbox_status CHECK ((status = ANY (ARRAY['pending'::text, 'taken'::text, 'processed'::text, 'dismissed'::text])))
);


--
-- Name: instance_owner; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_owner (
    id integer DEFAULT 1 NOT NULL,
    entry_id uuid NOT NULL,
    updated timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instance_owner_one CHECK ((id = 1))
);


--
-- Name: instance_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_rules (
    id integer DEFAULT 1 NOT NULL,
    rules text NOT NULL,
    updated timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instance_rules_one CHECK ((id = 1))
);


--
-- Name: links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.links (
    source_id uuid NOT NULL,
    target_id uuid NOT NULL,
    relation text NOT NULL,
    period text DEFAULT ''::text NOT NULL,
    field text DEFAULT ''::text NOT NULL,
    note text,
    valid_from date,
    valid_until date,
    provenance text,
    seq bigint NOT NULL,
    CONSTRAINT links_provenance CHECK ((((relation = 'mentions'::text) = (provenance IS NULL)) AND ((provenance IS NULL) OR (provenance = ANY (ARRAY['extracted'::text, 'inferred'::text, 'unstated'::text])))))
);


--
-- Name: links_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.links ALTER COLUMN seq ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.links_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media (
    id uuid DEFAULT uuidv7() NOT NULL,
    entry_id uuid NOT NULL,
    kind text NOT NULL,
    mime text NOT NULL,
    size integer NOT NULL,
    sha256 text NOT NULL,
    width integer,
    height integer,
    duration double precision,
    source_url text,
    alt text DEFAULT ''::text NOT NULL,
    "position" integer NOT NULL,
    created timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pending_references; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_references (
    source_id uuid NOT NULL,
    slug text NOT NULL
);


--
-- Name: type_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.type_proposals (
    id uuid DEFAULT uuidv7() NOT NULL,
    action text NOT NULL,
    type_name text NOT NULL,
    into_type text,
    mapping jsonb,
    proposed_by text NOT NULL,
    proposed_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_by text,
    decided_at timestamp with time zone
);


--
-- Name: types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.types (
    name text NOT NULL,
    label text NOT NULL,
    description text NOT NULL,
    fields jsonb NOT NULL,
    created timestamp with time zone DEFAULT now() NOT NULL,
    updated timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    sensitive boolean DEFAULT false NOT NULL,
    read_in_parent boolean DEFAULT false NOT NULL,
    dated_by text
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: -
--

INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (1, '2c0b465f5bb7bcda45b66f855e9a2ffe3f6c786a14bd45b948da2dfcc2295ad7', 1791280556000, '20261006095556_baseline', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (2, '59d8afe024b7e48dd0c12f79193b38534b2dd3879abcdebf4ff790f51a9bbc56', 1791281365000, '20261006100925_sensitive_types', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (3, '312d848500f6b68bca743a56bcb6afc62d853f39f3ccceb756753bfd10aaf518', 1791283071000, '20261006103751_entry_sources', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (4, 'ba42598c8515fab8a43835ca7160395e00ab1772637295fbe33103de870f209e', 1791283542000, '20261006104542_inbox', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (5, 'cd049b643c82d5bca9a9e0c52d4cd329b441f97b6c4211cde6a4c56540670689', 1791285374000, '20261006111614_inbox_mime', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (6, '9a48a30f9edb5fc0945a220ec434eac495314d62454ae03ab835a060af9ddae7', 1791288086000, '20261006120126_search_index', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (7, '796570782bc0b5f30dd6a176eaf399ccc12c93f9f8b3c05a5819e079cf274650', 1791302844000, '20261006160724_findings', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (8, '5fa13258be61bf684b05494f6fb9db555f8404f85333544f0165208d90495914', 1791358306000, '20261007073146_instance_rules', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (9, '071a3a0aea8da20aaf20238626e5d71fb740da8cbf7c28f920db68bd6aa906d0', 1791360007000, '20261007080007_read_in_parent', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (10, 'c86ed42f76c1419324c93ab525b5a7274244390d2c5ba924a48c0c655efe6b8c', 1791362896000, '20261007084816_pending_references', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (11, '6046770ce8dd09f6abe4ddb0199405067921e9a1910f126af0a793ac866574e5', 1791363515000, '20261007085835_merged_findings', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (12, '1b7e21af29379cc50b1967b6bf6dd02745344de06f1b09b90151f16a0dbbd78f', 1791370775000, '20261007105935_merged_into_key', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (13, '47a02fe4346d1f5110037e3b20fb4f1be5163ac71af5e1e14e9f4c5658c2791e', 1791371633000, '20261007111353_remove_source_registry', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (14, 'a1898393371b786315f511e641fc6bda5ff6807cc5fe28d662926ae326492ca9', 1791374251000, '20261007115731_link_note_and_dates', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (15, 'c499b165920331192c1d0a215f1b647ba70734061e7ff72671e336389463f347', 1791446385000, '20261008075945_resolve_stale_pending', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (16, '01b9f06886f4035ca397760af4e845825361e12fdab5f9465614835b59161fd8', 1791447143000, '20261008081223_archived_reason', '2026-10-11 13:42:05.23647+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (17, '3657eaa61b360fc6f79309ba57973f39403265686266116a88641d0804614e8d', 1791561641000, '20261009160041_entries_aliases', '2026-10-11 13:42:10.674879+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (18, '429565618d20d25d3022ed43a1a3a32f58ca35170dbe389f2618944a28fb37c1', 1791570551000, '20261009182911_known_or_supposed', '2026-10-11 13:42:10.674879+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (19, 'c79de8b82e34eb6c35b8031ab4c9b8034886e1021dd75a4b9b3abf1b02d9cfc8', 1791575260000, '20261009194740_part_of', '2026-10-11 13:42:10.674879+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (20, '73e5ff931cc1f2c58d0eb9fcd1baadc6303121d59fe58bc5634901beee968083', 1791579824000, '20261009210344_rename_to_hippocampe', '2026-10-11 13:42:10.674879+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (21, '00b6afbdcedc94db49027d5bde4a2a23af94da9ced0fdff86207c6c379b70a15', 1791647376000, '20261010154936_dated_by', '2026-10-11 13:42:10.674879+00');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) VALUES (22, '7f4c2f96101d6f6f258fc024b9d86861dc2e78cc88b6ca1df42eede4f522ad2c', 1791664069000, '20261010202749_instance_owner', '2026-10-11 13:42:10.674879+00');


--
-- Data for Name: auth_account; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: auth_apikey; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.auth_apikey (id, "configId", name, start, "referenceId", prefix, key, "refillInterval", "refillAmount", "lastRefillAt", enabled, "rateLimitEnabled", "rateLimitTimeWindow", "rateLimitMax", "requestCount", remaining, "lastRequest", "expiresAt", "createdAt", "updatedAt", permissions, metadata) VALUES ('zywdC7BJmoLPnLrxQONp4rCLxVfAOvTE', 'default', 'agent-desk', 'grenie', 'YvbJtLUWoOXqCZabezrhI3yBjNieEHs9', 'grenier_', 'UCzZenT7P5fbukrCFjuJWr0y5MMo_UJC5Xb7l_dOa_Q', NULL, NULL, NULL, true, false, 86400000, 10, 0, NULL, NULL, NULL, '2026-10-11 13:42:05.653+00', '2026-10-11 13:42:05.653+00', '{"hippocampe":["read","write"]}', '{}');
INSERT INTO public.auth_apikey (id, "configId", name, start, "referenceId", prefix, key, "refillInterval", "refillAmount", "lastRefillAt", enabled, "rateLimitEnabled", "rateLimitTimeWindow", "rateLimitMax", "requestCount", remaining, "lastRequest", "expiresAt", "createdAt", "updatedAt", permissions, metadata) VALUES ('30aHecjdh14R3VPAtGilTWaVXCQfoRNM', 'default', 'agent-kitchen', 'hippoc', 'YvbJtLUWoOXqCZabezrhI3yBjNieEHs9', 'hippocampe_', '0Jc2DhlDlFIJuC7M8a2G03HpItcInyiyOZNmksxUs6A', NULL, NULL, NULL, true, false, 86400000, 10, 0, NULL, NULL, NULL, '2026-10-11 13:42:10.869+00', '2026-10-11 13:42:10.869+00', '{"hippocampe":["read","write","sensitive"]}', '{}');
INSERT INTO public.auth_apikey (id, "configId", name, start, "referenceId", prefix, key, "refillInterval", "refillAmount", "lastRefillAt", enabled, "rateLimitEnabled", "rateLimitTimeWindow", "rateLimitMax", "requestCount", remaining, "lastRequest", "expiresAt", "createdAt", "updatedAt", permissions, metadata) VALUES ('M2RGJsG2UCfeS3OYc68SNkM2IfNDQa9t', 'default', 'agent-garden', 'hippoc', 'YvbJtLUWoOXqCZabezrhI3yBjNieEHs9', 'hippocampe_', '9938QYuqxmsGgyH6YjghzS7xNY3moKW247ugNmoxoNM', NULL, NULL, NULL, true, false, 86400000, 10, 0, NULL, NULL, NULL, '2026-10-11 13:42:13.138+00', '2026-10-11 13:42:13.138+00', '{"hippocampe":["read","write"]}', '{}');
INSERT INTO public.auth_apikey (id, "configId", name, start, "referenceId", prefix, key, "refillInterval", "refillAmount", "lastRefillAt", enabled, "rateLimitEnabled", "rateLimitTimeWindow", "rateLimitMax", "requestCount", remaining, "lastRequest", "expiresAt", "createdAt", "updatedAt", permissions, metadata) VALUES ('sPeYC3zUuAe1EX9VyKog34Wz4KyqoDxY', 'default', 'reader', 'hippoc', 'YvbJtLUWoOXqCZabezrhI3yBjNieEHs9', 'hippocampe_', 'Egr4owhq2rNe_5McXVl-Z6yH6B2UZGc-QRrHAJxjKg4', NULL, NULL, NULL, true, false, 86400000, 10, 0, NULL, NULL, NULL, '2026-10-11 13:42:15.023+00', '2026-10-11 13:42:15.023+00', '{"hippocampe":["read"]}', '{"expires_at":"2036-10-08T13:42:14.990Z"}');
INSERT INTO public.auth_apikey (id, "configId", name, start, "referenceId", prefix, key, "refillInterval", "refillAmount", "lastRefillAt", enabled, "rateLimitEnabled", "rateLimitTimeWindow", "rateLimitMax", "requestCount", remaining, "lastRequest", "expiresAt", "createdAt", "updatedAt", permissions, metadata) VALUES ('NizvvVIkolvEiH3UfWSSwTrrE8dJ3hyx', 'default', 'old-laptop', 'hippoc', 'YvbJtLUWoOXqCZabezrhI3yBjNieEHs9', 'hippocampe_', 'lQjNQkmv3PWVKX8VEyvEZzsPzDrG-ti-Rn9JojV9pMU', NULL, NULL, NULL, false, false, 86400000, 10, 0, NULL, NULL, NULL, '2026-10-11 13:42:17.192+00', '2026-10-11 13:42:17.192+00', '{"hippocampe":["read","write"]}', '{}');


--
-- Data for Name: auth_session; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: auth_user; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.auth_user (id, name, email, "emailVerified", image, "createdAt", "updatedAt") VALUES ('YvbJtLUWoOXqCZabezrhI3yBjNieEHs9', 'Owner', 'owner@example.org', true, NULL, '2026-10-11 13:42:05.59+00', '2026-10-11 13:42:05.59+00');


--
-- Data for Name: auth_verification; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: entries; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-0b49-70ba-99bd-903bb732c98c', 'room', 'Living room', 'living-room', '[]', '[]', '{}', '{"body": "unstated", "summary": "unstated"}', 'Two bookcases by the window.', 'The room with the books.', '2026-10-11 13:42:07.822732+00', '2026-10-11 13:42:07.822732+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-0bcc-7f6c-97b1-61aab43ad18c', 'book', 'Field guide to moths', 'field-guide-to-moths', '[]', '[]', '{"pages": 96, "publisher": "Lantern Press"}', '{"pages": "inferred", "publisher": "unstated"}', '', '', '2026-10-11 13:42:08.031954+00', '2026-10-11 13:42:08.031954+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-0c60-7cfc-9ad0-c7707771e9c7', 'book', 'Atlas of rivers', 'atlas-of-rivers', '[]', '[]', '{"pages": 212, "shelf": "top", "publisher": "Riverbend Press"}', '{"body": "unstated", "pages": "unstated", "shelf": "unstated", "publisher": "unstated"}', 'Bought second-hand; read with the [[field-guide-to-moths]].', '', '2026-10-11 13:42:08.152481+00', '2026-10-11 13:42:08.152481+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4d11-77cf-8ffe-add83e38a524', 'person', 'Morgan Vale', 'morgan-vale', '[]', '[]', '{}', '{"summary": "inferred"}', '', 'The owner of this Hippocampe.', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:24.582715+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4db0-70c2-b2ef-17592a9b8936', 'organization', 'Northwind Hardware', 'northwind-hardware', '[]', '["shop"]', '{"city": "Port Alder", "website": "https://northwind.example"}', '{"city": "extracted", "website": "extracted"}', '', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:24.582715+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"url": "https://northwind.example/contact", "note": "the contact page"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4e0c-7011-9515-bf8a83085a2e', 'organization', 'Bluebell Energy', 'bluebell-energy', '[]', '[]', '{"website": "https://bluebell.example"}', '{"website": "inferred"}', '', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:24.582715+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4e44-7b8b-9aae-2380ccdaa1d3', 'organization', 'Lakeside Library', 'lakeside-library', '[]', '[]', '{"city": "Port Alder"}', '{"city": "ambiguous"}', '', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:24.582715+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', 'note', 'Garden shed', 'garden-shed', '[]', '[]', '{}', '{"body": "extracted"}', 'The wooden shed at the end of the garden.', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:24.582715+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"on": "2026-09-02", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4ebe-7d3a-a74f-ead28710da06', 'note', 'Garage', 'garage', '[]', '[]', '{}', '{"body": "inferred"}', 'Beside the house.', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:24.582715+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4eed-75b6-bfd3-10bd6f9bb883', 'item', 'Workshop computer disk', 'workshop-computer-disk', '[]', '[]', '{"brand": "Petrel", "serial": "PT-77-0031"}', '{"brand": "extracted", "serial": "extracted"}', '', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:24.582715+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"note": "listed on its invoice", "entry": "01a12b33-4ed6-7c77-b8a3-949023b1bcbb"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4f5d-7971-8dbe-0db7ac1572ba', 'journal', 'Journal, 30 September', 'journal-2026-09-30', '[]', '[]', '{"mood": "calm"}', '{"body": "extracted", "mood": "extracted"}', 'A quiet day in the garden; the mower is getting old.', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:24.582715+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"on": "2026-09-30", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4f86-724f-bfb0-85230000a905', 'note', 'Garden plan 2025', 'garden-plan-2025', '[]', '[]', '{}', '{"body": "extracted"}', 'Tomatoes along the fence.', '', '2025-02-01 00:00:00+00', '2026-10-11 13:42:26.198785+00', NULL, NULL, '01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', NULL, 'public.hippocampe_simple', '', '[{"on": "2025-02-01", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4e6c-7ed9-b031-7913f7b592f4', 'person', 'Alma Quillon', 'alma-quillon', '["Alma Q."]', '[]', '{"email": "alma@example.org", "birthday": "1990-04-21", "employer": "01a12b33-4db0-70c2-b2ef-17592a9b8936", "languages": ["English", "Portuguese"]}', '{"body": "extracted", "email": "extracted", "birthday": "extracted", "employer": "extracted", "languages": "inferred"}', 'Met at [[northwind-hardware]]. Lends tools.', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:26.275433+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"on": "2026-09-01", "note": "at the hardware shop", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4f34-75fe-9f5b-f5876bb4309c', 'item', 'Old radio', 'old-radio', '[]', '[]', '{"brand": "Halcyon"}', '{"brand": "inferred"}', '', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:26.441155+00', NULL, NULL, NULL, '2026-10-11 13:42:26.441155+00', 'public.hippocampe_simple', '', '[]', 'given to a neighbour');
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4f48-760e-9dc0-620ad7f4f94e', 'contract', 'Home electricity', 'home-electricity', '[]', '[]', '{"renewal": "2025-11-01", "provider": "01a12b33-4e0c-7011-9515-bf8a83085a2e", "signed_at": "2024-10-15T09:30:00Z", "monthly_cost": "64.20 EUR", "notice_period": "P1M", "account_number": "ACC-5521"}', '{"renewal": "extracted", "provider": "extracted", "signed_at": "extracted", "monthly_cost": "extracted", "notice_period": "extracted", "account_number": "extracted"}', '', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:27.705129+00', '2024-11-01', NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"url": "https://bluebell.example/account", "note": "the customer account"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4f71-7c52-b828-974cb2f3279b', 'item', 'Pocket torch', 'pocket-torch', '[]', '[]', '{"brand": "Lumen"}', '{"brand": "inferred"}', '', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:33.563069+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4e8e-7b70-9169-7aaafbe6684c', 'person', 'Bruno Tessaly', 'bruno-tessaly', '[]', '[]', '{"employer": "01a12b33-4e0c-7011-9515-bf8a83085a2e"}', '{"employer": "extracted"}', '', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:36.63394+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"on": "2026-10-11", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4f0c-702e-85a2-e12ef9c3f7c3', 'item', 'Lawn mower', 'lawn-mower', '[]', '[]', '{"brand": "Greenfinch", "portable": true, "condition": "worn"}', '{"brand": "inferred", "portable": "inferred", "condition": "inferred"}', '', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:39.366405+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', 'Receipt of the mower', '[{"item": "01a12b33-80e0-7660-b2be-fa08be4cef47", "source": "inbox"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4f21-732d-8eb4-ababf28e2cc1', 'item', 'Bike pump', 'bike-pump', '[]', '[]', '{"brand": "Swiftair"}', '{"brand": "inferred"}', '', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:26.357362+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-55e8-7143-8b6a-ba7219faa656', 'note', 'Electricity renewal 2025', 'electricity-renewal-2025', '[]', '[]', '{}', '{"body": "extracted"}', 'Renewed for a year.', '', '2026-10-11 13:42:27.024321+00', '2026-10-11 13:42:27.024321+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"on": "2025-10-20", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', 'note', 'Garden plans', 'garden-plan', '["Vegetable plan"]', '["garden"]', '{}', '{"body": "inferred", "summary": "inferred"}', 'Started on 1 March.

Beans by the [[garden-shed]], an [[herb-spiral]] by the path; mow with the [[lawn-mower]].', 'What grows where this year.', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:26.116822+00', '2026-03-01', '2026-11-30', NULL, NULL, 'public.hippocampe_simple', 'Sketch of the beds', '[]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-4ed6-7c77-b8a3-949023b1bcbb', 'item', 'Workshop computer', 'workshop-computer', '[]', '["workshop", "computer"]', '{"brand": "Corvid", "price": "849.00 EUR", "serial": "CV-1029-XA", "power_w": 350, "sellers": ["01a12b33-4db0-70c2-b2ef-17592a9b8936", "01a12b33-4e44-7b8b-9aae-2380ccdaa1d3"], "portable": false, "bought_on": "2024-02-14", "condition": "worn", "weight_kg": 7.5, "warranty_until": "2027-02-14"}', '{"body": "inferred", "brand": "extracted", "price": "extracted", "serial": "extracted", "power_w": "extracted", "sellers": "inferred", "portable": "inferred", "bought_on": "ambiguous", "condition": "inferred", "weight_kg": "inferred", "warranty_until": "extracted"}', 'Under the left workbench. Probably needs a new fan.The fan was replaced in October.', '', '2026-10-11 13:42:24.582715+00', '2026-10-11 13:42:27.501391+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', 'Front of the case, with the new fan', '[{"note": "the invoice", "label": "invoice", "identifier": "INV-0042"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-8752-755b-948b-13e6306e1b29', 'note', 'Shed door', 'shed-door', '[]', '[]', '{}', '{"body": "extracted"}', 'The hinges need oil.', '', '2026-10-11 13:42:39.677802+00', '2026-10-11 13:42:39.677802+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"item": "01a12b33-80f6-7da2-829a-d9e8f3a75a5d", "source": "inbox"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-8b8f-7838-80cc-a6a236aac6d9', 'service', 'Roof felt replaced', 'roof-felt-replaced', '[]', '[]', '{"done_on": "2026-04-12"}', '{"done_on": "extracted"}', '', '', '2026-10-11 13:42:40.772523+00', '2026-10-11 13:42:40.772523+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"on": "2026-04-12", "said_by": "owner"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-8bb0-797d-9368-3e3cb53208cc', 'service', 'Door repainted', 'door-repainted', '[]', '[]', '{"done_on": "2026-06-03"}', '{"body": "extracted", "done_on": "extracted"}', 'Two coats of green paint.', '', '2026-10-11 13:42:40.810899+00', '2026-10-11 13:42:40.810899+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"on": "2026-06-03", "seen_by": "agent-kitchen"}]', NULL);
INSERT INTO public.entries (id, type, title, slug, aliases, tags, fields, provenance, body, summary, created, updated, valid_from, valid_until, superseded_by, archived_at, search_language, media_text, sources, archived_reason) VALUES ('01a12b33-8e74-70b5-bb84-32eab6006352', 'service', 'Gutter cleared', 'gutter-cleared', '[]', '[]', '{"done_on": "2026-09-14"}', '{"done_on": "extracted"}', '', '', '2026-10-11 13:42:41.521272+00', '2026-10-11 13:42:41.521272+00', NULL, NULL, NULL, NULL, 'public.hippocampe_simple', '', '[{"on": "2026-09-15", "note": "on the phone", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}]', NULL);


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (1, '2026-10-11 13:42:07.638484+00', 'agent-desk', NULL, 'room', 'define', '[{"after": "Room", "field": "label", "before": null}, {"after": "A room of the house.", "field": "description", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (2, '2026-10-11 13:42:07.739969+00', 'agent-desk', NULL, 'book', 'define', '[{"after": "Book", "field": "label", "before": null}, {"after": "A book on the shelves.", "field": "description", "before": null}, {"after": {"kind": "text", "name": "publisher"}, "field": "fields.publisher", "before": null}, {"after": {"kind": "integer", "name": "pages"}, "field": "fields.pages", "before": null}, {"after": {"kind": "text", "name": "shelf"}, "field": "fields.shelf", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (3, '2026-10-11 13:42:07.949547+00', 'agent-desk', '01a12b33-0b49-70ba-99bd-903bb732c98c', NULL, 'create', '[{"after": "room", "field": "type", "before": null}, {"after": "Living room", "field": "title", "before": null}, {"after": "living-room", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "Two bookcases by the window.", "field": "body", "before": null}, {"after": "The room with the books.", "field": "summary", "before": null}, {"after": false, "field": "verified", "before": null}, {"after": [], "field": "sources", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (4, '2026-10-11 13:42:08.079261+00', 'agent-desk', '01a12b33-0bcc-7f6c-97b1-61aab43ad18c', NULL, 'create', '[{"after": "book", "field": "type", "before": null}, {"after": "Field guide to moths", "field": "title", "before": null}, {"after": "field-guide-to-moths", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": false, "field": "verified", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "Lantern Press", "field": "fields.publisher", "before": null}, {"after": 96, "field": "fields.pages", "before": null}, {"after": "inferred", "field": "provenance.pages", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (5, '2026-10-11 13:42:08.231926+00', 'agent-desk', '01a12b33-0c60-7cfc-9ad0-c7707771e9c7', NULL, 'create', '[{"after": "book", "field": "type", "before": null}, {"after": "Atlas of rivers", "field": "title", "before": null}, {"after": "atlas-of-rivers", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "01a12b33-0b49-70ba-99bd-903bb732c98c", "field": "parent_id", "before": null}, {"after": "Bought second-hand; read with the [[field-guide-to-moths]].", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": false, "field": "verified", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "Riverbend Press", "field": "fields.publisher", "before": null}, {"after": 212, "field": "fields.pages", "before": null}, {"after": "top", "field": "fields.shelf", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (6, '2026-10-11 13:42:08.63658+00', 'agent-desk', '01a12b33-0c60-7cfc-9ad0-c7707771e9c7', NULL, 'link', '[{"after": {"note": "same shelf", "entry": "01a12b33-0bcc-7f6c-97b1-61aab43ad18c", "valid_from": "2021-05-01"}, "field": "links.see_also", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (7, '2026-10-11 13:42:24.10895+00', 'agent-kitchen', NULL, 'organization', 'define', '[{"after": "Organization", "field": "label", "before": null}, {"after": "A company, a shop or a library people deal with.", "field": "description", "before": null}, {"after": {"kind": "url", "name": "website"}, "field": "fields.website", "before": null}, {"after": {"kind": "text", "name": "city"}, "field": "fields.city", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (8, '2026-10-11 13:42:24.164603+00', 'agent-kitchen', NULL, 'person', 'define', '[{"after": "Person", "field": "label", "before": null}, {"after": "Someone the owner knows.", "field": "description", "before": null}, {"after": {"kind": "text", "name": "email", "sensitive": true}, "field": "fields.email", "before": null}, {"after": {"kind": "date", "name": "birthday", "recurs": {"every": "yearly", "notice": "P14D"}}, "field": "fields.birthday", "before": null}, {"after": {"kind": "entry", "name": "employer", "types": ["organization"]}, "field": "fields.employer", "before": null}, {"after": {"kind": "text", "many": true, "name": "languages"}, "field": "fields.languages", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (9, '2026-10-11 13:42:24.268569+00', 'agent-kitchen', NULL, 'item', 'define', '[{"after": "Item", "field": "label", "before": null}, {"after": "A thing the owner keeps: a tool, a machine, a piece of furniture.", "field": "description", "before": null}, {"after": true, "field": "read_in_parent", "before": null}, {"after": {"kind": "text", "name": "brand", "required": true}, "field": "fields.brand", "before": null}, {"after": {"kind": "text", "name": "serial", "sensitive": true}, "field": "fields.serial", "before": null}, {"after": {"kind": "money", "name": "price"}, "field": "fields.price", "before": null}, {"after": {"kind": "date", "name": "bought_on"}, "field": "fields.bought_on", "before": null}, {"after": {"due": {"notice": "P30D"}, "kind": "date", "name": "warranty_until"}, "field": "fields.warranty_until", "before": null}, {"after": {"kind": "entry", "many": true, "name": "sellers", "types": ["organization"]}, "field": "fields.sellers", "before": null}, {"after": {"kind": "integer", "name": "power_watts"}, "field": "fields.power_watts", "before": null}, {"after": {"kind": "number", "name": "weight_kg"}, "field": "fields.weight_kg", "before": null}, {"after": {"kind": "boolean", "name": "portable"}, "field": "fields.portable", "before": null}, {"after": {"kind": "enum", "name": "condition", "values": ["new", "used", "worn"]}, "field": "fields.condition", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (10, '2026-10-11 13:42:24.332121+00', 'agent-kitchen', NULL, 'contract', 'define', '[{"after": "Contract", "field": "label", "before": null}, {"after": "A contract or a subscription followed over time.", "field": "description", "before": null}, {"after": {"kind": "entry", "name": "provider", "types": ["organization"]}, "field": "fields.provider", "before": null}, {"after": {"kind": "money", "name": "monthly_cost"}, "field": "fields.monthly_cost", "before": null}, {"after": {"kind": "date", "name": "renewal", "recurs": {"every": "yearly", "notice": "P30D"}}, "field": "fields.renewal", "before": null}, {"after": {"kind": "duration", "name": "notice_period"}, "field": "fields.notice_period", "before": null}, {"after": {"kind": "datetime", "name": "signed_at"}, "field": "fields.signed_at", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (11, '2026-10-11 13:42:24.381301+00', 'agent-kitchen', NULL, 'journal', 'define', '[{"after": "Journal", "field": "label", "before": null}, {"after": "A page of the private journal.", "field": "description", "before": null}, {"after": true, "field": "sensitive", "before": null}, {"after": {"kind": "enum", "name": "mood", "values": ["calm", "busy", "tired"]}, "field": "fields.mood", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (12, '2026-10-11 13:42:24.416792+00', 'agent-kitchen', NULL, 'note', 'define', '[{"after": "Note", "field": "label", "before": null}, {"after": "A free note, or a place things are kept in.", "field": "description", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (13, '2026-10-11 13:42:24.479861+00', 'agent-kitchen', NULL, 'gadget', 'define', '[{"after": "Gadget", "field": "label", "before": null}, {"after": "A small device; to be merged into items.", "field": "description", "before": null}, {"after": {"kind": "text", "name": "brand"}, "field": "fields.brand", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (14, '2026-10-11 13:42:24.546367+00', 'agent-kitchen', NULL, 'draft', 'define', '[{"after": "Draft", "field": "label", "before": null}, {"after": "A type no entry uses.", "field": "description", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (15, '2026-10-11 13:42:24.793009+00', 'agent-kitchen', '01a12b33-4d11-77cf-8ffe-add83e38a524', NULL, 'create', '[{"after": "person", "field": "type", "before": null}, {"after": "Morgan Vale", "field": "title", "before": null}, {"after": "morgan-vale", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "The owner of this Hippocampe.", "field": "summary", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "inferred", "field": "provenance.summary", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (16, '2026-10-11 13:42:24.952016+00', 'agent-kitchen', '01a12b33-4db0-70c2-b2ef-17592a9b8936', NULL, 'create', '[{"after": "organization", "field": "type", "before": null}, {"after": "Northwind Hardware", "field": "title", "before": null}, {"after": "northwind-hardware", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": ["shop"], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"url": "https://northwind.example/contact", "note": "the contact page"}], "field": "sources", "before": null}, {"after": "https://northwind.example", "field": "fields.website", "before": null}, {"after": "Port Alder", "field": "fields.city", "before": null}, {"after": "extracted", "field": "provenance.website", "before": null}, {"after": "extracted", "field": "provenance.city", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (17, '2026-10-11 13:42:25.037925+00', 'agent-kitchen', '01a12b33-4e0c-7011-9515-bf8a83085a2e', NULL, 'create', '[{"after": "organization", "field": "type", "before": null}, {"after": "Bluebell Energy", "field": "title", "before": null}, {"after": "bluebell-energy", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "https://bluebell.example", "field": "fields.website", "before": null}, {"after": "inferred", "field": "provenance.website", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (18, '2026-10-11 13:42:25.097305+00', 'agent-kitchen', '01a12b33-4e44-7b8b-9aae-2380ccdaa1d3', NULL, 'create', '[{"after": "organization", "field": "type", "before": null}, {"after": "Lakeside Library", "field": "title", "before": null}, {"after": "lakeside-library", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "Port Alder", "field": "fields.city", "before": null}, {"after": "ambiguous", "field": "provenance.city", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (19, '2026-10-11 13:42:25.135335+00', 'agent-kitchen', '01a12b33-4e6c-7ed9-b031-7913f7b592f4', NULL, 'create', '[{"after": "person", "field": "type", "before": null}, {"after": "Alma Quillon", "field": "title", "before": null}, {"after": "alma-quillon", "field": "slug", "before": null}, {"after": ["Alma Q."], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "Met at [[northwind-hardware]]. Lends tools.", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"on": "2026-09-01", "note": "at the hardware shop", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}], "field": "sources", "before": null}, {"after": "alma@example.org", "field": "fields.email", "before": null}, {"after": "1990-04-12", "field": "fields.birthday", "before": null}, {"after": "01a12b33-4db0-70c2-b2ef-17592a9b8936", "field": "fields.employer", "before": null}, {"after": ["English", "Portuguese"], "field": "fields.languages", "before": null}, {"after": "extracted", "field": "provenance.email", "before": null}, {"after": "extracted", "field": "provenance.birthday", "before": null}, {"after": "extracted", "field": "provenance.employer", "before": null}, {"after": "inferred", "field": "provenance.languages", "before": null}, {"after": "extracted", "field": "provenance.body", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (20, '2026-10-11 13:42:25.16917+00', 'agent-kitchen', '01a12b33-4e8e-7b70-9169-7aaafbe6684c', NULL, 'create', '[{"after": "person", "field": "type", "before": null}, {"after": "Bruno Tessaly", "field": "title", "before": null}, {"after": "bruno-tessaly", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "01a12b33-4e0c-7011-9515-bf8a83085a2e", "field": "fields.employer", "before": null}, {"after": "inferred", "field": "provenance.employer", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (21, '2026-10-11 13:42:25.192445+00', 'agent-kitchen', '01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', NULL, 'create', '[{"after": "note", "field": "type", "before": null}, {"after": "Garden shed", "field": "title", "before": null}, {"after": "garden-shed", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "The wooden shed at the end of the garden.", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"on": "2026-09-02", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}], "field": "sources", "before": null}, {"after": "extracted", "field": "provenance.body", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (22, '2026-10-11 13:42:25.216521+00', 'agent-kitchen', '01a12b33-4ebe-7d3a-a74f-ead28710da06', NULL, 'create', '[{"after": "note", "field": "type", "before": null}, {"after": "Garage", "field": "title", "before": null}, {"after": "garage", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "Beside the house.", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "inferred", "field": "provenance.body", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (31, '2026-10-11 13:42:25.415868+00', 'agent-kitchen', '01a12b33-4f86-724f-bfb0-85230000a905', NULL, 'create', '[{"after": "note", "field": "type", "before": null}, {"after": "Garden plan 2025", "field": "title", "before": null}, {"after": "garden-plan-2025", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "Tomatoes along the fence.", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"on": "2025-02-01", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}], "field": "sources", "before": null}, {"after": "extracted", "field": "provenance.body", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (23, '2026-10-11 13:42:25.240533+00', 'agent-kitchen', '01a12b33-4ed6-7c77-b8a3-949023b1bcbb', NULL, 'create', '[{"after": "item", "field": "type", "before": null}, {"after": "Workshop computer", "field": "title", "before": null}, {"after": "workshop-computer", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": ["workshop", "computer"], "field": "tags", "before": null}, {"after": "Under the workbench. Probably needs a new fan.", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"note": "the invoice", "label": "invoice", "identifier": "INV-0042"}], "field": "sources", "before": null}, {"after": "Corvid", "field": "fields.brand", "before": null}, {"after": "CV-1029-XA", "field": "fields.serial", "before": null}, {"after": "899.00 EUR", "field": "fields.price", "before": null}, {"after": "2024-02-14", "field": "fields.bought_on", "before": null}, {"after": "2027-02-14", "field": "fields.warranty_until", "before": null}, {"after": ["01a12b33-4db0-70c2-b2ef-17592a9b8936", "01a12b33-4e44-7b8b-9aae-2380ccdaa1d3"], "field": "fields.sellers", "before": null}, {"after": 350, "field": "fields.power_watts", "before": null}, {"after": 7.5, "field": "fields.weight_kg", "before": null}, {"after": false, "field": "fields.portable", "before": null}, {"after": "used", "field": "fields.condition", "before": null}, {"after": "extracted", "field": "provenance.brand", "before": null}, {"after": "extracted", "field": "provenance.serial", "before": null}, {"after": "extracted", "field": "provenance.price", "before": null}, {"after": "ambiguous", "field": "provenance.bought_on", "before": null}, {"after": "extracted", "field": "provenance.warranty_until", "before": null}, {"after": "inferred", "field": "provenance.sellers", "before": null}, {"after": "extracted", "field": "provenance.power_watts", "before": null}, {"after": "inferred", "field": "provenance.weight_kg", "before": null}, {"after": "inferred", "field": "provenance.portable", "before": null}, {"after": "inferred", "field": "provenance.condition", "before": null}, {"after": "inferred", "field": "provenance.body", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (24, '2026-10-11 13:42:25.26438+00', 'agent-kitchen', '01a12b33-4eed-75b6-bfd3-10bd6f9bb883', NULL, 'create', '[{"after": "item", "field": "type", "before": null}, {"after": "Workshop computer disk", "field": "title", "before": null}, {"after": "workshop-computer-disk", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"note": "listed on its invoice", "entry": "01a12b33-4ed6-7c77-b8a3-949023b1bcbb"}], "field": "sources", "before": null}, {"after": "Petrel", "field": "fields.brand", "before": null}, {"after": "PT-77-0031", "field": "fields.serial", "before": null}, {"after": "extracted", "field": "provenance.brand", "before": null}, {"after": "extracted", "field": "provenance.serial", "before": null}, {"after": {"entry": "01a12b33-4ed6-7c77-b8a3-949023b1bcbb", "provenance": "extracted"}, "field": "links.part_of", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (25, '2026-10-11 13:42:25.295071+00', 'agent-kitchen', '01a12b33-4f0c-702e-85a2-e12ef9c3f7c3', NULL, 'create', '[{"after": "item", "field": "type", "before": null}, {"after": "Lawn mower", "field": "title", "before": null}, {"after": "lawn-mower", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "Greenfinch", "field": "fields.brand", "before": null}, {"after": "worn", "field": "fields.condition", "before": null}, {"after": true, "field": "fields.portable", "before": null}, {"after": "inferred", "field": "provenance.brand", "before": null}, {"after": "inferred", "field": "provenance.condition", "before": null}, {"after": "inferred", "field": "provenance.portable", "before": null}, {"after": {"entry": "01a12b33-4ea6-7c37-8af3-fcadcbbcaf97", "provenance": "inferred"}, "field": "links.part_of", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (26, '2026-10-11 13:42:25.315947+00', 'agent-kitchen', '01a12b33-4f21-732d-8eb4-ababf28e2cc1', NULL, 'create', '[{"after": "item", "field": "type", "before": null}, {"after": "Bike pump", "field": "title", "before": null}, {"after": "bike-pump", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "Swiftair", "field": "fields.brand", "before": null}, {"after": "inferred", "field": "provenance.brand", "before": null}, {"after": {"entry": "01a12b33-4ea6-7c37-8af3-fcadcbbcaf97", "provenance": "inferred"}, "field": "links.part_of", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (27, '2026-10-11 13:42:25.33434+00', 'agent-kitchen', '01a12b33-4f34-75fe-9f5b-f5876bb4309c', NULL, 'create', '[{"after": "item", "field": "type", "before": null}, {"after": "Old radio", "field": "title", "before": null}, {"after": "old-radio", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "Halcyon", "field": "fields.brand", "before": null}, {"after": "inferred", "field": "provenance.brand", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (28, '2026-10-11 13:42:25.354314+00', 'agent-kitchen', '01a12b33-4f48-760e-9dc0-620ad7f4f94e', NULL, 'create', '[{"after": "contract", "field": "type", "before": null}, {"after": "Home electricity", "field": "title", "before": null}, {"after": "home-electricity", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": "2024-11-01", "field": "valid_from", "before": null}, {"after": [{"url": "https://bluebell.example/account", "note": "the customer account"}], "field": "sources", "before": null}, {"after": "01a12b33-4e0c-7011-9515-bf8a83085a2e", "field": "fields.provider", "before": null}, {"after": "64.20 EUR", "field": "fields.monthly_cost", "before": null}, {"after": "2025-11-01", "field": "fields.renewal", "before": null}, {"after": "P1M", "field": "fields.notice_period", "before": null}, {"after": "2024-10-15T09:30:00Z", "field": "fields.signed_at", "before": null}, {"after": "extracted", "field": "provenance.provider", "before": null}, {"after": "extracted", "field": "provenance.monthly_cost", "before": null}, {"after": "extracted", "field": "provenance.renewal", "before": null}, {"after": "extracted", "field": "provenance.notice_period", "before": null}, {"after": "extracted", "field": "provenance.signed_at", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (29, '2026-10-11 13:42:25.375503+00', 'agent-kitchen', '01a12b33-4f5d-7971-8dbe-0db7ac1572ba', NULL, 'create', '[{"after": "journal", "field": "type", "before": null}, {"after": "Journal, 30 September", "field": "title", "before": null}, {"after": "journal-2026-09-30", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "A quiet day in the garden; the mower is getting old.", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"on": "2026-09-30", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}], "field": "sources", "before": null}, {"after": "calm", "field": "fields.mood", "before": null}, {"after": "extracted", "field": "provenance.mood", "before": null}, {"after": "extracted", "field": "provenance.body", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (30, '2026-10-11 13:42:25.395449+00', 'agent-kitchen', '01a12b33-4f71-7c52-b828-974cb2f3279b', NULL, 'create', '[{"after": "gadget", "field": "type", "before": null}, {"after": "Pocket torch", "field": "title", "before": null}, {"after": "pocket-torch", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "Lumen", "field": "fields.brand", "before": null}, {"after": "inferred", "field": "provenance.brand", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (32, '2026-10-11 13:42:25.437285+00', 'agent-kitchen', '01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', NULL, 'create', '[{"after": "note", "field": "type", "before": null}, {"after": "Garden plans", "field": "title", "before": null}, {"after": "garden-plans", "field": "slug", "before": null}, {"after": ["Vegetable plan"], "field": "aliases", "before": null}, {"after": ["garden"], "field": "tags", "before": null}, {"after": "Beans by the [[garden-shed]], an [[herb-spiral]] by the path; mow with the [[lawn-mower]].", "field": "body", "before": null}, {"after": "What grows where this year.", "field": "summary", "before": null}, {"after": "2026-03-01", "field": "valid_from", "before": null}, {"after": "2026-11-30", "field": "valid_until", "before": null}, {"after": [], "field": "sources", "before": null}, {"after": "inferred", "field": "provenance.body", "before": null}, {"after": "inferred", "field": "provenance.summary", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (33, '2026-10-11 13:42:25.67509+00', 'agent-kitchen', '01a12b33-4ed6-7c77-b8a3-949023b1bcbb', NULL, 'update', '[{"after": "849.00 EUR", "field": "fields.price", "before": "899.00 EUR"}, {"after": "worn", "field": "fields.condition", "before": "used"}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (34, '2026-10-11 13:42:25.776648+00', 'agent-kitchen', '01a12b33-4ed6-7c77-b8a3-949023b1bcbb', NULL, 'update', '[{"after": "Under the workbench. Probably needs a new fan.The fan was replaced in October.", "field": "body", "before": "Under the workbench. Probably needs a new fan."}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (35, '2026-10-11 13:42:25.946907+00', 'agent-kitchen', '01a12b33-4ed6-7c77-b8a3-949023b1bcbb', NULL, 'update', '[{"after": "Under the left workbench. Probably needs a new fan.The fan was replaced in October.", "field": "body", "before": "Under the workbench. Probably needs a new fan.The fan was replaced in October."}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (36, '2026-10-11 13:42:26.050709+00', 'agent-kitchen', '01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', NULL, 'update', '[{"after": "garden-plan", "field": "slug", "before": "garden-plans"}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (37, '2026-10-11 13:42:26.144743+00', 'agent-kitchen', '01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', NULL, 'update', '[{"after": "Started on 1 March.\n\nBeans by the [[garden-shed]], an [[herb-spiral]] by the path; mow with the [[lawn-mower]].", "field": "body", "before": "Beans by the [[garden-shed]], an [[herb-spiral]] by the path; mow with the [[lawn-mower]]."}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (38, '2026-10-11 13:42:26.212664+00', 'agent-kitchen', '01a12b33-4f86-724f-bfb0-85230000a905', NULL, 'update', '[{"after": "01a12b33-4f9a-74c5-896d-ddfbe0e39fe5", "field": "superseded_by", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (39, '2026-10-11 13:42:26.302524+00', 'agent-kitchen', '01a12b33-4e6c-7ed9-b031-7913f7b592f4', NULL, 'update', '[{"after": "1990-04-21", "field": "fields.birthday", "before": "1990-04-12"}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (40, '2026-10-11 13:42:26.393466+00', 'agent-kitchen', '01a12b33-4f21-732d-8eb4-ababf28e2cc1', NULL, 'update', '[{"after": {"entry": "01a12b33-4ea6-7c37-8af3-fcadcbbcaf97", "provenance": "inferred", "valid_until": "2026-10-10"}, "field": "links.part_of", "before": {"entry": "01a12b33-4ea6-7c37-8af3-fcadcbbcaf97", "provenance": "inferred"}}, {"after": {"entry": "01a12b33-4ebe-7d3a-a74f-ead28710da06", "provenance": "inferred", "valid_from": "2026-10-11"}, "field": "links.part_of", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (41, '2026-10-11 13:42:26.456326+00', 'agent-kitchen', '01a12b33-4f34-75fe-9f5b-f5876bb4309c', NULL, 'archive', '[{"after": "2026-10-11T13:42:26.441Z", "field": "archived_at", "before": null}, {"after": "given to a neighbour", "field": "archived_reason", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (42, '2026-10-11 13:42:26.550687+00', 'agent-kitchen', '01a12b33-4e6c-7ed9-b031-7913f7b592f4', NULL, 'link', '[{"after": {"note": "cashier", "entry": "01a12b33-4db0-70c2-b2ef-17592a9b8936", "provenance": "extracted", "valid_from": "2019-03-01", "valid_until": "2021-08-31"}, "field": "links.works_at", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (43, '2026-10-11 13:42:26.627051+00', 'agent-kitchen', '01a12b33-4e8e-7b70-9169-7aaafbe6684c', NULL, 'link', '[{"after": {"note": "meter reader", "entry": "01a12b33-4e0c-7011-9515-bf8a83085a2e", "provenance": "inferred", "valid_from": "2022-05-01"}, "field": "links.works_at", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (44, '2026-10-11 13:42:26.673513+00', 'agent-kitchen', '01a12b33-4e6c-7ed9-b031-7913f7b592f4', NULL, 'link', '[{"after": {"entry": "01a12b33-4e8e-7b70-9169-7aaafbe6684c", "provenance": "inferred"}, "field": "links.knows", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (45, '2026-10-11 13:42:26.716324+00', 'agent-kitchen', '01a12b33-4f0c-702e-85a2-e12ef9c3f7c3', NULL, 'link', '[{"after": {"note": "spring sale", "entry": "01a12b33-4db0-70c2-b2ef-17592a9b8936", "provenance": "inferred"}, "field": "links.bought_from", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (46, '2026-10-11 13:42:26.781682+00', 'agent-kitchen', '01a12b33-4f34-75fe-9f5b-f5876bb4309c', NULL, 'link', '[{"after": {"entry": "01a12b33-4ea6-7c37-8af3-fcadcbbcaf97", "provenance": "inferred", "valid_from": "2018-01-01", "valid_until": "2020-12-31"}, "field": "links.part_of", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (47, '2026-10-11 13:42:26.861487+00', 'agent-kitchen', '01a12b33-4f34-75fe-9f5b-f5876bb4309c', NULL, 'link', '[{"after": {"entry": "01a12b33-4ea6-7c37-8af3-fcadcbbcaf97", "provenance": "inferred", "valid_from": "2023-01-01", "valid_until": "2024-06-30"}, "field": "links.part_of.2023-01-01", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (48, '2026-10-11 13:42:26.910403+00', 'agent-kitchen', '01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', NULL, 'link', '[{"after": {"entry": "01a12b33-4ed6-7c77-b8a3-949023b1bcbb", "provenance": "inferred"}, "field": "links.about", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (49, '2026-10-11 13:42:26.955846+00', 'agent-kitchen', '01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', NULL, 'unlink', '[{"after": null, "field": "links.about", "before": {"entry": "01a12b33-4ed6-7c77-b8a3-949023b1bcbb", "provenance": "inferred"}}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (50, '2026-10-11 13:42:27.053524+00', 'agent-kitchen', '01a12b33-55e8-7143-8b6a-ba7219faa656', NULL, 'create', '[{"after": "note", "field": "type", "before": null}, {"after": "Electricity renewal 2025", "field": "title", "before": null}, {"after": "electricity-renewal-2025", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "Renewed for a year.", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"on": "2025-10-20", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}], "field": "sources", "before": null}, {"after": "extracted", "field": "provenance.body", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (51, '2026-10-11 13:42:27.150004+00', 'agent-kitchen', '01a12b33-55e8-7143-8b6a-ba7219faa656', NULL, 'link', '[{"after": {"entry": "01a12b33-4f48-760e-9dc0-620ad7f4f94e", "provenance": "extracted"}, "field": "links.fulfills.renewal.2025", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (52, '2026-10-11 13:42:27.218261+00', 'agent-kitchen', '01a12b33-4ed6-7c77-b8a3-949023b1bcbb', NULL, 'attach', '[{"after": {"mime": "image/png", "size": 68, "sha256": "63ef318d96b5d0d0ceba6e04a4e622b1158335cdc67c49e27839132c6f655058"}, "field": "media.01a12b33-568c-7986-bd4e-6c6d176e506e", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (53, '2026-10-11 13:42:27.26271+00', 'agent-kitchen', '01a12b33-4ed6-7c77-b8a3-949023b1bcbb', NULL, 'update', '[{"after": "Front of the case, with the new fan", "field": "media.01a12b33-568c-7986-bd4e-6c6d176e506e.alt", "before": "Front of the case"}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (54, '2026-10-11 13:42:27.307842+00', 'agent-kitchen', '01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', NULL, 'attach', '[{"after": {"mime": "image/svg+xml", "size": 111, "sha256": "a0b033249dfac33872fd0ee79092a054b856076d1d990dc936c6b807a1fe763b"}, "field": "media.01a12b33-56e8-7569-8317-8ebafb2d5187", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (55, '2026-10-11 13:42:27.346127+00', 'agent-kitchen', NULL, 'organization', 'change_type', '[{"after": "A company, a shop, a library or any body the owner deals with.", "field": "description", "before": "A company, a shop or a library people deal with."}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (56, '2026-10-11 13:42:27.453202+00', 'agent-kitchen', NULL, 'person', 'add_field', '[{"after": {"kind": "text", "name": "nickname"}, "field": "fields.nickname", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (57, '2026-10-11 13:42:27.520719+00', 'agent-kitchen', NULL, 'item', 'change_field', '[{"after": null, "field": "fields.power_watts", "before": {"kind": "integer", "name": "power_watts"}}, {"after": {"kind": "integer", "name": "power_w"}, "field": "fields.power_w", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (58, '2026-10-11 13:42:27.528947+00', 'agent-kitchen', '01a12b33-4ed6-7c77-b8a3-949023b1bcbb', NULL, 'update', '[{"after": null, "field": "fields.power_watts", "before": 350}, {"after": null, "field": "provenance.power_watts", "before": "extracted"}, {"after": 350, "field": "fields.power_w", "before": null}, {"after": "extracted", "field": "provenance.power_w", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (59, '2026-10-11 13:42:27.585996+00', 'agent-kitchen', NULL, 'item', 'change_field', '[{"after": {"kind": "enum", "name": "condition", "values": ["new", "used", "worn", "broken"]}, "field": "fields.condition", "before": {"kind": "enum", "name": "condition", "values": ["new", "used", "worn"]}}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (60, '2026-10-11 13:42:27.633625+00', 'agent-kitchen', NULL, 'contract', 'change_field', '[{"after": {"kind": "entry", "name": "provider", "types": ["organization"], "required": true}, "field": "fields.provider", "before": {"kind": "entry", "name": "provider", "types": ["organization"]}}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (61, '2026-10-11 13:42:27.675879+00', 'agent-kitchen', NULL, 'contract', 'add_field', '[{"after": {"kind": "text", "name": "account_number", "sensitive": true}, "field": "fields.account_number", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (62, '2026-10-11 13:42:27.726738+00', 'agent-kitchen', '01a12b33-4f48-760e-9dc0-620ad7f4f94e', NULL, 'update', '[{"after": "ACC-5521", "field": "fields.account_number", "before": null}, {"after": "extracted", "field": "provenance.account_number", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (63, '2026-10-11 13:42:29.669318+00', 'owner', NULL, 'contract', 'change_field', '[{"after": {"kind": "text", "name": "account_number"}, "field": "fields.account_number", "before": {"kind": "text", "name": "account_number", "sensitive": true}}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (64, '2026-10-11 13:42:29.725724+00', 'agent-kitchen', NULL, 'note', 'change_type', '[{"after": true, "field": "sensitive", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (65, '2026-10-11 13:42:31.735192+00', 'owner', NULL, 'note', 'change_type', '[{"after": null, "field": "sensitive", "before": true}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (66, '2026-10-11 13:42:33.623997+00', 'owner', '01a12b33-4f71-7c52-b828-974cb2f3279b', NULL, 'update', '[{"after": "item", "field": "type", "before": "gadget"}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (67, '2026-10-11 13:42:33.633784+00', 'owner', NULL, 'gadget', 'merge', '[{"after": "item", "field": "deleted", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (68, '2026-10-11 13:42:35.386497+00', 'owner', '01a12b33-4e8e-7b70-9169-7aaafbe6684c', NULL, 'update', '[{"after": [{"on": "2026-10-11", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}], "field": "sources", "before": []}, {"after": "extracted", "field": "provenance.employer", "before": "inferred"}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (69, '2026-10-11 13:42:36.684058+00', 'owner', '01a12b33-4e8e-7b70-9169-7aaafbe6684c', NULL, 'update', '[{"after": {"note": "meter reader", "entry": "01a12b33-4e0c-7011-9515-bf8a83085a2e", "provenance": "extracted", "valid_from": "2022-05-01"}, "field": "links.works_at", "before": {"note": "meter reader", "entry": "01a12b33-4e0c-7011-9515-bf8a83085a2e", "provenance": "inferred", "valid_from": "2022-05-01"}}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (70, '2026-10-11 13:42:39.451709+00', 'agent-garden', '01a12b33-4f0c-702e-85a2-e12ef9c3f7c3', NULL, 'update', '[{"after": [{"item": "01a12b33-80e0-7660-b2be-fa08be4cef47", "source": "inbox"}], "field": "sources", "before": []}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (71, '2026-10-11 13:42:39.509849+00', 'agent-garden', '01a12b33-4f0c-702e-85a2-e12ef9c3f7c3', NULL, 'attach', '[{"after": {"mime": "image/png", "size": 70, "sha256": "6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0"}, "field": "media.01a12b33-8691-763a-aaa1-a527a01d5d44", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (72, '2026-10-11 13:42:39.702186+00', 'agent-garden', '01a12b33-8752-755b-948b-13e6306e1b29', NULL, 'create', '[{"after": "note", "field": "type", "before": null}, {"after": "Shed door", "field": "title", "before": null}, {"after": "shed-door", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "The hinges need oil.", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"item": "01a12b33-80f6-7da2-829a-d9e8f3a75a5d", "source": "inbox"}], "field": "sources", "before": null}, {"after": "extracted", "field": "provenance.body", "before": null}, {"after": {"entry": "01a12b33-4ea6-7c37-8af3-fcadcbbcaf97", "provenance": "extracted"}, "field": "links.part_of", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (73, '2026-10-11 13:42:40.755017+00', 'agent-kitchen', NULL, 'service', 'define', '[{"after": "Service", "field": "label", "before": null}, {"after": "Work done on a thing on a given day: a repair, a cleaning, a check.", "field": "description", "before": null}, {"after": "done_on", "field": "dated_by", "before": null}, {"after": {"kind": "date", "name": "done_on", "required": true}, "field": "fields.done_on", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (74, '2026-10-11 13:42:40.786813+00', 'agent-kitchen', '01a12b33-8b8f-7838-80cc-a6a236aac6d9', NULL, 'create', '[{"after": "service", "field": "type", "before": null}, {"after": "Roof felt replaced", "field": "title", "before": null}, {"after": "roof-felt-replaced", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"on": "2026-04-12", "said_by": "owner"}], "field": "sources", "before": null}, {"after": "2026-04-12", "field": "fields.done_on", "before": null}, {"after": "extracted", "field": "provenance.done_on", "before": null}, {"after": {"entry": "01a12b33-4ea6-7c37-8af3-fcadcbbcaf97", "provenance": "extracted"}, "field": "links.part_of", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (75, '2026-10-11 13:42:40.818324+00', 'agent-kitchen', '01a12b33-8bb0-797d-9368-3e3cb53208cc', NULL, 'create', '[{"after": "service", "field": "type", "before": null}, {"after": "Door repainted", "field": "title", "before": null}, {"after": "door-repainted", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "Two coats of green paint.", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"on": "2026-06-03", "seen_by": "agent-kitchen"}], "field": "sources", "before": null}, {"after": "2026-06-03", "field": "fields.done_on", "before": null}, {"after": "extracted", "field": "provenance.done_on", "before": null}, {"after": "extracted", "field": "provenance.body", "before": null}, {"after": {"entry": "01a12b33-4ea6-7c37-8af3-fcadcbbcaf97", "provenance": "extracted"}, "field": "links.part_of", "before": null}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (76, '2026-10-11 13:42:41.490996+00', 'owner', '01a12b33-4d11-77cf-8ffe-add83e38a524', NULL, 'owner', '[{"after": true, "field": "owner", "before": false}]');
INSERT INTO public.events (id, at, actor, entry_id, type_name, action, changes) OVERRIDING SYSTEM VALUE VALUES (77, '2026-10-11 13:42:41.524751+00', 'agent-kitchen', '01a12b33-8e74-70b5-bb84-32eab6006352', NULL, 'create', '[{"after": "service", "field": "type", "before": null}, {"after": "Gutter cleared", "field": "title", "before": null}, {"after": "gutter-cleared", "field": "slug", "before": null}, {"after": [], "field": "aliases", "before": null}, {"after": [], "field": "tags", "before": null}, {"after": "", "field": "body", "before": null}, {"after": "", "field": "summary", "before": null}, {"after": [{"on": "2026-09-15", "note": "on the phone", "said_by": "01a12b33-4d11-77cf-8ffe-add83e38a524"}], "field": "sources", "before": null}, {"after": "2026-09-14", "field": "fields.done_on", "before": null}, {"after": "extracted", "field": "provenance.done_on", "before": null}, {"after": {"entry": "01a12b33-4ea6-7c37-8af3-fcadcbbcaf97", "provenance": "extracted"}, "field": "links.part_of", "before": null}]');


--
-- Data for Name: finding_occurrences; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.finding_occurrences (id, finding, at, origin, title, severity, trying, happened, expected, steps, instance, version, commit, key_name, call_tool, call_arguments) OVERRIDING SYSTEM VALUE VALUES (1, 1, '2026-10-11 13:42:39.756385+00', 'agent', 'The parent of a moved entry is hard to find', 'cosmetic', 'Finding where the bike pump was before.', 'Its former place is only in part_of.', 'A word in the path.', '', 'local', '0.7.0', 'fixture', 'agent-garden', NULL, NULL);
INSERT INTO public.finding_occurrences (id, finding, at, origin, title, severity, trying, happened, expected, steps, instance, version, commit, key_name, call_tool, call_arguments) OVERRIDING SYSTEM VALUE VALUES (2, 1, '2026-10-11 13:42:39.796646+00', 'agent', 'The parent of a moved entry is hard to find', 'cosmetic', 'Finding where the old radio was.', 'Again only in part_of.', 'A word in the path.', '', 'local', '0.7.0', 'fixture', 'agent-kitchen', NULL, NULL);
INSERT INTO public.finding_occurrences (id, finding, at, origin, title, severity, trying, happened, expected, steps, instance, version, commit, key_name, call_tool, call_arguments) OVERRIDING SYSTEM VALUE VALUES (3, 1, '2026-10-11 13:42:39.819956+00', 'agent', 'Former places are not in the path', 'hurts', 'Reading the bike pump.', 'The garden shed is not named in the path.', 'The former place named.', '', 'local', '0.7.0', 'fixture', 'agent-garden', NULL, NULL);


--
-- Data for Name: findings; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.findings (number, title, kind, place, severity, occurrences, first_seen, last_seen, merged_into) OVERRIDING SYSTEM VALUE VALUES (1, 'The parent of a moved entry is hard to find', 'model_friction', 'read', 'hurts', 3, '2026-10-11 13:42:39.754964+00', '2026-10-11 13:42:39.818792+00', NULL);
INSERT INTO public.findings (number, title, kind, place, severity, occurrences, first_seen, last_seen, merged_into) OVERRIDING SYSTEM VALUE VALUES (2, 'Former places are not in the path', 'model_friction', 'read', 'hurts', 0, '2026-10-11 13:42:39.818792+00', '2026-10-11 13:42:39.818792+00', 1);


--
-- Data for Name: heads_up; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.heads_up (actor, entry_id, field, period, day) VALUES ('agent-kitchen', '01a12b33-4f48-760e-9dc0-620ad7f4f94e', 'renewal', '2026', '2026-10-11');
INSERT INTO public.heads_up (actor, entry_id, field, period, day) VALUES ('agent-garden', '01a12b33-4f48-760e-9dc0-620ad7f4f94e', 'renewal', '2026', '2026-10-11');


--
-- Data for Name: inbox; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.inbox (id, kind, name, content, sha256, size, origin, received_at, status, taken_by, taken_at, closed_by, closed_at, reason, mime) VALUES ('01a12b33-80e0-7660-b2be-fa08be4cef47', 'file', 'receipt.png', NULL, '6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0', 70, 'scanner', '2026-10-11 13:42:38.024132+00', 'processed', 'agent-garden', '2026-10-11 13:42:39.289776+00', 'agent-garden', '2026-10-11 13:42:39.366405+00', NULL, 'image/png');
INSERT INTO public.inbox (id, kind, name, content, sha256, size, origin, received_at, status, taken_by, taken_at, closed_by, closed_at, reason, mime) VALUES ('01a12b33-858f-72bb-95c8-3b17e6632854', 'url', NULL, 'https://example.org/compost-guide', NULL, NULL, 'phone', '2026-10-11 13:42:39.246999+00', 'dismissed', 'agent-garden', '2026-10-11 13:42:39.533922+00', 'agent-garden', '2026-10-11 13:42:39.561499+00', 'already read', NULL);
INSERT INTO public.inbox (id, kind, name, content, sha256, size, origin, received_at, status, taken_by, taken_at, closed_by, closed_at, reason, mime) VALUES ('01a12b33-855d-7ff3-8df7-a3a7dba0a9f6', 'text', NULL, 'Buy seeds for the herb spiral.', NULL, NULL, 'phone', '2026-10-11 13:42:39.197633+00', 'pending', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.inbox (id, kind, name, content, sha256, size, origin, received_at, status, taken_by, taken_at, closed_by, closed_at, reason, mime) VALUES ('01a12b33-80f6-7da2-829a-d9e8f3a75a5d', 'file', 'to-do.txt', 'Oil the hinges of the shed door.
', NULL, 33, 'scanner', '2026-10-11 13:42:38.064893+00', 'taken', 'agent-garden', '2026-10-11 13:42:39.648192+00', NULL, NULL, NULL, NULL);


--
-- Data for Name: instance_owner; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.instance_owner (id, entry_id, updated) VALUES (1, '01a12b33-4d11-77cf-8ffe-add83e38a524', '2026-10-11 13:42:41.476555+00');


--
-- Data for Name: instance_rules; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.instance_rules (id, rules, updated) VALUES (1, '# Rules

- Write titles in sentence case.
- Prices in euros.
', '2026-10-11 13:42:22.026678+00');


--
-- Data for Name: links; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-0c60-7cfc-9ad0-c7707771e9c7', '01a12b33-0bcc-7f6c-97b1-61aab43ad18c', 'mentions', '', '', NULL, NULL, NULL, NULL, 1);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-0c60-7cfc-9ad0-c7707771e9c7', '01a12b33-0bcc-7f6c-97b1-61aab43ad18c', 'see_also', '', '', 'same shelf', '2021-05-01', NULL, 'unstated', 2);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-0c60-7cfc-9ad0-c7707771e9c7', '01a12b33-0b49-70ba-99bd-903bb732c98c', 'part_of', '', '', NULL, NULL, NULL, 'unstated', -1);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4eed-75b6-bfd3-10bd6f9bb883', '01a12b33-4ed6-7c77-b8a3-949023b1bcbb', 'part_of', '', '', NULL, NULL, NULL, 'extracted', 4);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4f0c-702e-85a2-e12ef9c3f7c3', '01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', 'part_of', '', '', NULL, NULL, NULL, 'inferred', 5);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4e6c-7ed9-b031-7913f7b592f4', '01a12b33-4db0-70c2-b2ef-17592a9b8936', 'mentions', '', '', NULL, NULL, NULL, NULL, 9);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', '01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', 'mentions', '', '', NULL, NULL, NULL, NULL, 12);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', '01a12b33-4f0c-702e-85a2-e12ef9c3f7c3', 'mentions', '', '', NULL, NULL, NULL, NULL, 13);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4f21-732d-8eb4-ababf28e2cc1', '01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', 'part_of', '', '', NULL, NULL, '2026-10-10', 'inferred', 6);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4f21-732d-8eb4-ababf28e2cc1', '01a12b33-4ebe-7d3a-a74f-ead28710da06', 'part_of', '', '', NULL, '2026-10-11', NULL, 'inferred', 14);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4e6c-7ed9-b031-7913f7b592f4', '01a12b33-4db0-70c2-b2ef-17592a9b8936', 'works_at', '', '', 'cashier', '2019-03-01', '2021-08-31', 'extracted', 15);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4e6c-7ed9-b031-7913f7b592f4', '01a12b33-4e8e-7b70-9169-7aaafbe6684c', 'knows', '', '', NULL, NULL, NULL, 'inferred', 17);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4f0c-702e-85a2-e12ef9c3f7c3', '01a12b33-4db0-70c2-b2ef-17592a9b8936', 'bought_from', '', '', 'spring sale', NULL, NULL, 'inferred', 18);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4f34-75fe-9f5b-f5876bb4309c', '01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', 'part_of', '', '', NULL, '2018-01-01', '2020-12-31', 'inferred', 19);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4f34-75fe-9f5b-f5876bb4309c', '01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', 'part_of', '2023-01-01', '', NULL, '2023-01-01', '2024-06-30', 'inferred', 20);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-55e8-7143-8b6a-ba7219faa656', '01a12b33-4f48-760e-9dc0-620ad7f4f94e', 'fulfills', '2025', 'renewal', NULL, NULL, NULL, 'extracted', 22);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-4e8e-7b70-9169-7aaafbe6684c', '01a12b33-4e0c-7011-9515-bf8a83085a2e', 'works_at', '', '', 'meter reader', '2022-05-01', NULL, 'extracted', 16);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-8752-755b-948b-13e6306e1b29', '01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', 'part_of', '', '', NULL, NULL, NULL, 'extracted', 23);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-8b8f-7838-80cc-a6a236aac6d9', '01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', 'part_of', '', '', NULL, NULL, NULL, 'extracted', 24);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-8bb0-797d-9368-3e3cb53208cc', '01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', 'part_of', '', '', NULL, NULL, NULL, 'extracted', 25);
INSERT INTO public.links (source_id, target_id, relation, period, field, note, valid_from, valid_until, provenance, seq) VALUES ('01a12b33-8e74-70b5-bb84-32eab6006352', '01a12b33-4ea6-7c37-8af3-fcadcbbcaf97', 'part_of', '', '', NULL, NULL, NULL, 'extracted', 26);


--
-- Data for Name: media; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.media (id, entry_id, kind, mime, size, sha256, width, height, duration, source_url, alt, "position", created) VALUES ('01a12b33-568c-7986-bd4e-6c6d176e506e', '01a12b33-4ed6-7c77-b8a3-949023b1bcbb', 'image', 'image/png', 68, '63ef318d96b5d0d0ceba6e04a4e622b1158335cdc67c49e27839132c6f655058', 1, 1, NULL, NULL, 'Front of the case, with the new fan', 1, '2026-10-11 13:42:27.203696+00');
INSERT INTO public.media (id, entry_id, kind, mime, size, sha256, width, height, duration, source_url, alt, "position", created) VALUES ('01a12b33-56e8-7569-8317-8ebafb2d5187', '01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', 'image', 'image/svg+xml', 111, 'a0b033249dfac33872fd0ee79092a054b856076d1d990dc936c6b807a1fe763b', 40, 20, NULL, NULL, 'Sketch of the beds', 1, '2026-10-11 13:42:27.299102+00');
INSERT INTO public.media (id, entry_id, kind, mime, size, sha256, width, height, duration, source_url, alt, "position", created) VALUES ('01a12b33-8691-763a-aaa1-a527a01d5d44', '01a12b33-4f0c-702e-85a2-e12ef9c3f7c3', 'image', 'image/png', 70, '6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0', 1, 1, NULL, NULL, 'Receipt of the mower', 1, '2026-10-11 13:42:39.366405+00');


--
-- Data for Name: pending_references; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.pending_references (source_id, slug) VALUES ('01a12b33-4f9a-74c5-896d-ddfbe0e39fe5', 'herb-spiral');


--
-- Data for Name: type_proposals; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.type_proposals (id, action, type_name, into_type, mapping, proposed_by, proposed_at, status, decided_by, decided_at) VALUES ('01a12b33-68ef-7b64-adff-9fcd61235048', 'delete', 'draft', NULL, NULL, 'agent-kitchen', '2026-10-11 13:42:31.919613+00', 'pending', NULL, NULL);
INSERT INTO public.type_proposals (id, action, type_name, into_type, mapping, proposed_by, proposed_at, status, decided_by, decided_at) VALUES ('01a12b33-688b-72d7-8d44-46dd756c8a6a', 'merge', 'gadget', 'item', '{"brand": "brand"}', 'agent-kitchen', '2026-10-11 13:42:31.818738+00', 'confirmed', 'owner', '2026-10-11 13:42:33.563069+00');


--
-- Data for Name: types; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('room', 'Room', 'A room of the house.', '[]', '2026-10-11 13:42:07.608546+00', '2026-10-11 13:42:07.608546+00', NULL, false, false, NULL);
INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('book', 'Book', 'A book on the shelves.', '[{"kind": "text", "name": "publisher"}, {"kind": "integer", "name": "pages"}, {"kind": "text", "name": "shelf"}]', '2026-10-11 13:42:07.718349+00', '2026-10-11 13:42:07.718349+00', NULL, false, false, NULL);
INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('journal', 'Journal', 'A page of the private journal.', '[{"kind": "enum", "name": "mood", "values": ["calm", "busy", "tired"]}]', '2026-10-11 13:42:24.365614+00', '2026-10-11 13:42:24.365614+00', NULL, true, false, NULL);
INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('draft', 'Draft', 'A type no entry uses.', '[]', '2026-10-11 13:42:24.525082+00', '2026-10-11 13:42:24.525082+00', NULL, false, false, NULL);
INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('organization', 'Organization', 'A company, a shop, a library or any body the owner deals with.', '[{"kind": "url", "name": "website"}, {"kind": "text", "name": "city"}]', '2026-10-11 13:42:24.08507+00', '2026-10-11 13:42:27.33908+00', NULL, false, false, NULL);
INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('person', 'Person', 'Someone the owner knows.', '[{"kind": "text", "name": "email", "sensitive": true}, {"kind": "date", "name": "birthday", "recurs": {"every": "yearly", "notice": "P14D"}}, {"kind": "entry", "name": "employer", "types": ["organization"]}, {"kind": "text", "many": true, "name": "languages"}, {"kind": "text", "name": "nickname"}]', '2026-10-11 13:42:24.154884+00', '2026-10-11 13:42:27.426052+00', NULL, false, false, NULL);
INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('item', 'Item', 'A thing the owner keeps: a tool, a machine, a piece of furniture.', '[{"kind": "text", "name": "brand", "required": true}, {"kind": "text", "name": "serial", "sensitive": true}, {"kind": "money", "name": "price"}, {"kind": "date", "name": "bought_on"}, {"due": {"notice": "P30D"}, "kind": "date", "name": "warranty_until"}, {"kind": "entry", "many": true, "name": "sellers", "types": ["organization"]}, {"kind": "integer", "name": "power_w"}, {"kind": "number", "name": "weight_kg"}, {"kind": "boolean", "name": "portable"}, {"kind": "enum", "name": "condition", "values": ["new", "used", "worn", "broken"]}]', '2026-10-11 13:42:24.246925+00', '2026-10-11 13:42:27.574727+00', NULL, false, true, NULL);
INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('contract', 'Contract', 'A contract or a subscription followed over time.', '[{"kind": "entry", "name": "provider", "types": ["organization"], "required": true}, {"kind": "money", "name": "monthly_cost"}, {"kind": "date", "name": "renewal", "recurs": {"every": "yearly", "notice": "P30D"}}, {"kind": "duration", "name": "notice_period"}, {"kind": "datetime", "name": "signed_at"}, {"kind": "text", "name": "account_number"}]', '2026-10-11 13:42:24.322787+00', '2026-10-11 13:42:29.628561+00', NULL, false, false, NULL);
INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('note', 'Note', 'A free note, or a place things are kept in.', '[]', '2026-10-11 13:42:24.408681+00', '2026-10-11 13:42:31.696241+00', NULL, false, false, NULL);
INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('gadget', 'Gadget', 'A small device; to be merged into items.', '[{"kind": "text", "name": "brand"}]', '2026-10-11 13:42:24.463311+00', '2026-10-11 13:42:24.463311+00', '2026-10-11 13:42:33.563069+00', false, false, NULL);
INSERT INTO public.types (name, label, description, fields, created, updated, deleted_at, sensitive, read_in_parent, dated_by) VALUES ('service', 'Service', 'Work done on a thing on a given day: a repair, a cleaning, a check.', '[{"kind": "date", "name": "done_on", "required": true}]', '2026-10-11 13:42:40.753031+00', '2026-10-11 13:42:40.753031+00', NULL, false, false, 'done_on');


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: -
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 22, true);


--
-- Name: events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.events_id_seq', 77, true);


--
-- Name: finding_occurrences_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.finding_occurrences_id_seq', 3, true);


--
-- Name: findings_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.findings_number_seq', 2, true);


--
-- Name: links_seq_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.links_seq_seq', 26, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: auth_account auth_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_account
    ADD CONSTRAINT auth_account_pkey PRIMARY KEY (id);


--
-- Name: auth_apikey auth_apikey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_apikey
    ADD CONSTRAINT auth_apikey_pkey PRIMARY KEY (id);


--
-- Name: auth_session auth_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT auth_session_pkey PRIMARY KEY (id);


--
-- Name: auth_session auth_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT auth_session_token_key UNIQUE (token);


--
-- Name: auth_user auth_user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_email_key UNIQUE (email);


--
-- Name: auth_user auth_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_pkey PRIMARY KEY (id);


--
-- Name: auth_verification auth_verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_verification
    ADD CONSTRAINT auth_verification_pkey PRIMARY KEY (id);


--
-- Name: entries entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_pkey PRIMARY KEY (id);


--
-- Name: entries entries_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_slug_key UNIQUE (slug);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: finding_occurrences finding_occurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finding_occurrences
    ADD CONSTRAINT finding_occurrences_pkey PRIMARY KEY (id);


--
-- Name: findings findings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_pkey PRIMARY KEY (number);


--
-- Name: heads_up heads_up_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heads_up
    ADD CONSTRAINT heads_up_pkey PRIMARY KEY (actor, entry_id, field, period, day);


--
-- Name: inbox inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox
    ADD CONSTRAINT inbox_pkey PRIMARY KEY (id);


--
-- Name: instance_owner instance_owner_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_owner
    ADD CONSTRAINT instance_owner_pkey PRIMARY KEY (id);


--
-- Name: instance_rules instance_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_rules
    ADD CONSTRAINT instance_rules_pkey PRIMARY KEY (id);


--
-- Name: links links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_pkey PRIMARY KEY (source_id, target_id, relation, period, field);


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: pending_references pending_references_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_references
    ADD CONSTRAINT pending_references_pkey PRIMARY KEY (source_id, slug);


--
-- Name: type_proposals type_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.type_proposals
    ADD CONSTRAINT type_proposals_pkey PRIMARY KEY (id);


--
-- Name: types types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.types
    ADD CONSTRAINT types_pkey PRIMARY KEY (name);


--
-- Name: auth_apikey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_apikey_key ON public.auth_apikey USING btree (key);


--
-- Name: auth_session_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_session_user ON public.auth_session USING btree ("userId");


--
-- Name: entries_aliases; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entries_aliases ON public.entries USING gin (aliases);


--
-- Name: entries_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entries_search ON public.entries USING gin ((((search || setweight(jsonb_to_tsvector(search_language, fields, '["string", "numeric"]'::jsonb), 'C'::"char")) || setweight(jsonb_to_tsvector(search_language, ((jsonb_path_query_array(sources, '$[*]."url"'::jsonpath) || jsonb_path_query_array(sources, '$[*]."identifier"'::jsonpath)) || jsonb_path_query_array(sources, '$[*]."label"'::jsonpath)), '["string"]'::jsonb), 'C'::"char"))));


--
-- Name: entries_sources; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entries_sources ON public.entries USING gin (sources jsonb_path_ops);


--
-- Name: entries_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entries_type ON public.entries USING btree (type);


--
-- Name: events_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_entry_id ON public.events USING btree (entry_id);


--
-- Name: events_type_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_type_name ON public.events USING btree (type_name);


--
-- Name: finding_occurrences_finding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finding_occurrences_finding ON public.finding_occurrences USING btree (finding, at);


--
-- Name: findings_kind_place; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX findings_kind_place ON public.findings USING btree (kind, place);


--
-- Name: inbox_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_status ON public.inbox USING btree (status, received_at);


--
-- Name: links_part_of; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX links_part_of ON public.links USING btree (target_id, source_id) WHERE (relation = 'part_of'::text);


--
-- Name: links_target_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX links_target_id ON public.links USING btree (target_id);


--
-- Name: media_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_entry_id ON public.media USING btree (entry_id);


--
-- Name: media_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sha256 ON public.media USING btree (sha256);


--
-- Name: pending_references_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_references_slug ON public.pending_references USING btree (slug);


--
-- Name: auth_account auth_account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_account
    ADD CONSTRAINT "auth_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: auth_apikey auth_apikey_referenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_apikey
    ADD CONSTRAINT "auth_apikey_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: auth_session auth_session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT "auth_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: entries entries_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.entries(id);


--
-- Name: entries entries_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_type_fkey FOREIGN KEY (type) REFERENCES public.types(name);


--
-- Name: events events_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id);


--
-- Name: events events_type_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_type_name_fkey FOREIGN KEY (type_name) REFERENCES public.types(name);


--
-- Name: finding_occurrences finding_occurrences_finding_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finding_occurrences
    ADD CONSTRAINT finding_occurrences_finding_fkey FOREIGN KEY (finding) REFERENCES public.findings(number);


--
-- Name: findings findings_merged_into_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.findings(number);


--
-- Name: heads_up heads_up_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heads_up
    ADD CONSTRAINT heads_up_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id);


--
-- Name: instance_owner instance_owner_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_owner
    ADD CONSTRAINT instance_owner_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id);


--
-- Name: links links_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.entries(id);


--
-- Name: links links_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.entries(id);


--
-- Name: media media_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id);


--
-- Name: pending_references pending_references_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_references
    ADD CONSTRAINT pending_references_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.entries(id);


--
-- Name: type_proposals type_proposals_into_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.type_proposals
    ADD CONSTRAINT type_proposals_into_type_fkey FOREIGN KEY (into_type) REFERENCES public.types(name);


--
-- Name: type_proposals type_proposals_type_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.type_proposals
    ADD CONSTRAINT type_proposals_type_name_fkey FOREIGN KEY (type_name) REFERENCES public.types(name);


--
-- PostgreSQL database dump complete
--


