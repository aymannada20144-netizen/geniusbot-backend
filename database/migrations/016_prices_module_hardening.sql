-- ============================================================================
-- GeniusBot Database
-- Migration: 016_prices_module_hardening.sql
-- PostgreSQL: 16+
-- ============================================================================

BEGIN;

ALTER TABLE geniusbot.prices
    ALTER COLUMN currency SET DEFAULT 'SAR';

DROP VIEW IF EXISTS geniusbot.v_current_service_prices;
DROP VIEW IF EXISTS geniusbot.vw_current_service_prices;

DROP TRIGGER IF EXISTS trg_prices_set_updated_at ON geniusbot.prices;
DROP TRIGGER IF EXISTS trg_prices_validate_integrity ON geniusbot.prices;
DROP TRIGGER IF EXISTS trg_prices_prevent_hard_delete ON geniusbot.prices;
DROP TRIGGER IF EXISTS trg_prices_validate_before_write ON geniusbot.prices;

DROP FUNCTION IF EXISTS geniusbot.validate_price_integrity();
DROP FUNCTION IF EXISTS geniusbot.prevent_price_hard_delete();
DROP FUNCTION IF EXISTS geniusbot.prices_validate_before_write();

DROP INDEX IF EXISTS geniusbot.unique_active_service_price;
DROP INDEX IF EXISTS geniusbot.unique_service_price_start;
DROP INDEX IF EXISTS geniusbot.idx_prices_active_lookup;
DROP INDEX IF EXISTS geniusbot.idx_prices_lookup;

ALTER TABLE geniusbot.prices
    DROP CONSTRAINT IF EXISTS prices_check,
    DROP CONSTRAINT IF EXISTS prices_price_check,
    DROP CONSTRAINT IF EXISTS chk_prices_amount_non_negative,
    DROP CONSTRAINT IF EXISTS chk_prices_price_non_negative,
    DROP CONSTRAINT IF EXISTS chk_prices_currency,
    DROP CONSTRAINT IF EXISTS chk_prices_validity_range,
    DROP CONSTRAINT IF EXISTS chk_prices_insurance_pair,
    DROP CONSTRAINT IF EXISTS excl_prices_active_period_overlap,
    DROP CONSTRAINT IF EXISTS fk_prices_clinic,
    DROP CONSTRAINT IF EXISTS fk_prices_service,
    DROP CONSTRAINT IF EXISTS fk_prices_payment_method,
    DROP CONSTRAINT IF EXISTS fk_prices_insurance_company,
    DROP CONSTRAINT IF EXISTS fk_prices_insurance_class;

ALTER TABLE geniusbot.prices
    ADD CONSTRAINT fk_prices_clinic
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_prices_service
        FOREIGN KEY (service_id)
        REFERENCES geniusbot.services(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_prices_payment_method
        FOREIGN KEY (payment_method_id)
        REFERENCES geniusbot.payment_methods(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_prices_insurance_company
        FOREIGN KEY (insurance_company_id)
        REFERENCES geniusbot.insurance_companies(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_prices_insurance_class
        FOREIGN KEY (insurance_class_id)
        REFERENCES geniusbot.insurance_classes(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    ADD CONSTRAINT chk_prices_price_non_negative
        CHECK (price >= 0),
    ADD CONSTRAINT chk_prices_currency
        CHECK (currency = upper(btrim(currency)) AND currency ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT chk_prices_validity_range
        CHECK (valid_to IS NULL OR valid_to >= valid_from),
    ADD CONSTRAINT excl_prices_active_period_overlap
        EXCLUDE USING gist (
            clinic_id geniusbot.gist_uuid_ops WITH =,
            service_id geniusbot.gist_uuid_ops WITH =,
            payment_method_id geniusbot.gist_uuid_ops WITH =,
            (coalesce(
                insurance_company_id,
                '00000000-0000-0000-0000-000000000000'::uuid
            )) geniusbot.gist_uuid_ops WITH =,
            (coalesce(
                insurance_class_id,
                '00000000-0000-0000-0000-000000000000'::uuid
            )) geniusbot.gist_uuid_ops WITH =,
            (daterange(
                valid_from,
                coalesce(valid_to + 1, 'infinity'::date),
                '[)'
            )) WITH &&
        ) WHERE (is_active IS TRUE);

CREATE INDEX idx_prices_lookup
    ON geniusbot.prices (
        clinic_id,
        service_id,
        payment_method_id,
        insurance_company_id,
        insurance_class_id,
        valid_from,
        valid_to
    );

CREATE INDEX idx_prices_active_lookup
    ON geniusbot.prices (
        clinic_id,
        service_id,
        payment_method_id,
        valid_from,
        valid_to
    )
    WHERE is_active IS TRUE;

CREATE FUNCTION geniusbot.prices_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_clinic_active boolean;
    v_service_clinic_id uuid;
    v_service_active boolean;
    v_payment_method_clinic_id uuid;
    v_payment_method_active boolean;
    v_payment_method_code text;
    v_insurance_company_clinic_id uuid;
    v_insurance_company_active boolean;
    v_insurance_class_company_id uuid;
    v_insurance_class_active boolean;
BEGIN
    NEW.currency := upper(btrim(NEW.currency));

    SELECT c.is_active
      INTO v_clinic_active
      FROM geniusbot.clinics AS c
     WHERE c.id = NEW.clinic_id
     FOR KEY SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23503',
            CONSTRAINT = 'fk_prices_clinic',
            MESSAGE = 'PRICE_CLINIC_NOT_FOUND';
    END IF;

    SELECT s.clinic_id, s.is_active
      INTO v_service_clinic_id, v_service_active
      FROM geniusbot.services AS s
     WHERE s.id = NEW.service_id
     FOR KEY SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23503',
            CONSTRAINT = 'fk_prices_service',
            MESSAGE = 'PRICE_SERVICE_NOT_FOUND';
    END IF;

    IF v_service_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_prices_service_tenant',
            MESSAGE = 'PRICE_SERVICE_CLINIC_MISMATCH';
    END IF;

    SELECT pm.clinic_id, pm.is_active, lower(btrim(pm.code))
      INTO v_payment_method_clinic_id,
           v_payment_method_active,
           v_payment_method_code
      FROM geniusbot.payment_methods AS pm
     WHERE pm.id = NEW.payment_method_id
     FOR KEY SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23503',
            CONSTRAINT = 'fk_prices_payment_method',
            MESSAGE = 'PRICE_PAYMENT_METHOD_NOT_FOUND';
    END IF;

    IF v_payment_method_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_prices_payment_method_tenant',
            MESSAGE = 'PRICE_PAYMENT_METHOD_CLINIC_MISMATCH';
    END IF;

    IF v_payment_method_code = 'cash' THEN
        IF NEW.insurance_company_id IS NOT NULL
           OR NEW.insurance_class_id IS NOT NULL THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'chk_prices_cash_scope',
                MESSAGE = 'PRICE_CASH_REQUIRES_NULL_INSURANCE';
        END IF;
    ELSIF v_payment_method_code = 'insurance' THEN
        IF NEW.insurance_company_id IS NULL
           OR NEW.insurance_class_id IS NULL THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'chk_prices_insurance_scope',
                MESSAGE = 'PRICE_INSURANCE_REQUIRES_COMPANY_AND_CLASS';
        END IF;
    ELSE
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_prices_payment_method_code',
            MESSAGE = 'PRICE_PAYMENT_METHOD_UNSUPPORTED';
    END IF;

    IF NEW.insurance_company_id IS NOT NULL THEN
        SELECT ic.clinic_id, ic.is_active
          INTO v_insurance_company_clinic_id,
               v_insurance_company_active
          FROM geniusbot.insurance_companies AS ic
         WHERE ic.id = NEW.insurance_company_id
         FOR KEY SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION USING
                ERRCODE = '23503',
                CONSTRAINT = 'fk_prices_insurance_company',
                MESSAGE = 'PRICE_INSURANCE_COMPANY_NOT_FOUND';
        END IF;

        IF v_insurance_company_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'chk_prices_insurance_company_tenant',
                MESSAGE = 'PRICE_INSURANCE_COMPANY_CLINIC_MISMATCH';
        END IF;
    END IF;

    IF NEW.insurance_class_id IS NOT NULL THEN
        SELECT cls.insurance_company_id, cls.is_accepted
          INTO v_insurance_class_company_id,
               v_insurance_class_active
          FROM geniusbot.insurance_classes AS cls
         WHERE cls.id = NEW.insurance_class_id
         FOR KEY SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION USING
                ERRCODE = '23503',
                CONSTRAINT = 'fk_prices_insurance_class',
                MESSAGE = 'PRICE_INSURANCE_CLASS_NOT_FOUND';
        END IF;

        IF v_insurance_class_company_id
           IS DISTINCT FROM NEW.insurance_company_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'chk_prices_insurance_class_company',
                MESSAGE = 'PRICE_INSURANCE_CLASS_COMPANY_MISMATCH';
        END IF;
    END IF;

    IF NOT v_clinic_active THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_prices_clinic_active',
            MESSAGE = 'PRICE_REQUIRES_ACTIVE_CLINIC';
    END IF;

    IF NOT v_service_active THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_prices_service_active',
            MESSAGE = 'PRICE_REQUIRES_ACTIVE_SERVICE';
    END IF;

    IF NOT v_payment_method_active THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_prices_payment_method_active',
            MESSAGE = 'PRICE_REQUIRES_ACTIVE_PAYMENT_METHOD';
    END IF;

    IF NEW.insurance_company_id IS NOT NULL
       AND NOT v_insurance_company_active THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_prices_insurance_company_active',
            MESSAGE = 'PRICE_REQUIRES_ACTIVE_INSURANCE_COMPANY';
    END IF;

    IF NEW.insurance_class_id IS NOT NULL
       AND NOT v_insurance_class_active THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_prices_insurance_class_active',
            MESSAGE = 'PRICE_REQUIRES_ACTIVE_INSURANCE_CLASS';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.prices_validate_before_write() IS
    'Normalizes price currency and validates resource activity, ownership, and payment scope.';

CREATE TRIGGER trg_prices_validate_before_write
BEFORE INSERT OR UPDATE ON geniusbot.prices
FOR EACH ROW
EXECUTE FUNCTION geniusbot.prices_validate_before_write();

CREATE VIEW geniusbot.vw_current_service_prices AS
SELECT
    p.id,
    p.clinic_id,
    p.service_id,
    s.name AS service_name,
    p.payment_method_id,
    pm.name AS payment_method_name,
    pm.code AS payment_method_code,
    p.insurance_company_id,
    ic.name AS insurance_company_name,
    p.insurance_class_id,
    cls.class_name AS insurance_class_name,
    p.price,
    p.currency,
    p.valid_from,
    p.valid_to,
    p.created_at,
    p.updated_at
FROM geniusbot.prices AS p
JOIN geniusbot.services AS s
  ON s.id = p.service_id
JOIN geniusbot.payment_methods AS pm
  ON pm.id = p.payment_method_id
LEFT JOIN geniusbot.insurance_companies AS ic
  ON ic.id = p.insurance_company_id
LEFT JOIN geniusbot.insurance_classes AS cls
  ON cls.id = p.insurance_class_id
WHERE p.is_active IS TRUE
  AND p.valid_from <= CURRENT_DATE
  AND (p.valid_to IS NULL OR p.valid_to >= CURRENT_DATE);

COMMENT ON VIEW geniusbot.vw_current_service_prices IS
    'Active service prices whose validity period includes the current date.';

COMMIT;
