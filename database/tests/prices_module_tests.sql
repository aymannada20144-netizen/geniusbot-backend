-- ============================================================================
-- GeniusBot Database
-- Prices module tests
-- ============================================================================

BEGIN;

INSERT INTO geniusbot.clinics (
    id,
    name,
    timezone,
    default_language,
    is_active
)
VALUES
    (
        'f1600000-0000-0000-0000-000000000001',
        'Prices Test Clinic A',
        'Asia/Riyadh',
        'ar',
        true
    ),
    (
        'f1600000-0000-0000-0000-000000000002',
        'Prices Test Clinic B',
        'Asia/Riyadh',
        'ar',
        true
    );

INSERT INTO geniusbot.services (
    id,
    clinic_id,
    name,
    duration_minutes,
    is_active
)
VALUES
    (
        'f1600000-0000-0000-0000-000000000101',
        'f1600000-0000-0000-0000-000000000001',
        'Prices Test Service A',
        30,
        true
    ),
    (
        'f1600000-0000-0000-0000-000000000201',
        'f1600000-0000-0000-0000-000000000002',
        'Prices Test Service B',
        30,
        true
    );

INSERT INTO geniusbot.payment_methods (
    id,
    clinic_id,
    name,
    code,
    is_active
)
VALUES
    (
        'f1600000-0000-0000-0000-000000000301',
        'f1600000-0000-0000-0000-000000000001',
        'Prices Test Cash',
        'Cash',
        true
    ),
    (
        'f1600000-0000-0000-0000-000000000302',
        'f1600000-0000-0000-0000-000000000001',
        'Prices Test Insurance',
        'Insurance',
        true
    );

INSERT INTO geniusbot.insurance_companies (
    id,
    clinic_id,
    name,
    is_active
)
VALUES
    (
        'f1600000-0000-0000-0000-000000000501',
        'f1600000-0000-0000-0000-000000000001',
        'Prices Test Insurance Company A',
        true
    ),
    (
        'f1600000-0000-0000-0000-000000000502',
        'f1600000-0000-0000-0000-000000000001',
        'Prices Test Insurance Company B',
        true
    );

INSERT INTO geniusbot.insurance_classes (
    id,
    insurance_company_id,
    class_name,
    is_accepted
)
VALUES
    (
        'f1600000-0000-0000-0000-000000000701',
        'f1600000-0000-0000-0000-000000000501',
        'A',
        true
    ),
    (
        'f1600000-0000-0000-0000-000000000702',
        'f1600000-0000-0000-0000-000000000502',
        'B',
        true
    );

-- Cash valid.
INSERT INTO geniusbot.prices (
    id,
    clinic_id,
    service_id,
    payment_method_id,
    price,
    valid_from,
    valid_to,
    is_active
)
VALUES (
    'f1600000-0000-0000-0000-000000001001',
    'f1600000-0000-0000-0000-000000000001',
    'f1600000-0000-0000-0000-000000000101',
    'f1600000-0000-0000-0000-000000000301',
    100,
    CURRENT_DATE,
    CURRENT_DATE + 9,
    true
);

-- Insurance valid.
INSERT INTO geniusbot.prices (
    id,
    clinic_id,
    service_id,
    payment_method_id,
    insurance_company_id,
    insurance_class_id,
    price,
    valid_from,
    valid_to,
    is_active
)
VALUES (
    'f1600000-0000-0000-0000-000000001002',
    'f1600000-0000-0000-0000-000000000001',
    'f1600000-0000-0000-0000-000000000101',
    'f1600000-0000-0000-0000-000000000302',
    'f1600000-0000-0000-0000-000000000501',
    'f1600000-0000-0000-0000-000000000701',
    80,
    CURRENT_DATE,
    NULL,
    true
);

DO $tests$
BEGIN
    -- Cash + insurance rejection.
    BEGIN
        INSERT INTO geniusbot.prices (
            id, clinic_id, service_id, payment_method_id,
            insurance_company_id, insurance_class_id, price, valid_from
        )
        VALUES (
            'f1600000-0000-0000-0000-000000001003',
            'f1600000-0000-0000-0000-000000000001',
            'f1600000-0000-0000-0000-000000000101',
            'f1600000-0000-0000-0000-000000000301',
            'f1600000-0000-0000-0000-000000000501',
            'f1600000-0000-0000-0000-000000000701',
            90,
            CURRENT_DATE + 20
        );
        RAISE EXCEPTION 'TEST_FAILED: cash + insurance was accepted';
    EXCEPTION
        WHEN check_violation THEN
            IF SQLERRM = 'TEST_FAILED: cash + insurance was accepted' THEN
                RAISE;
            END IF;
    END;

    -- Insurance missing class.
    BEGIN
        INSERT INTO geniusbot.prices (
            id, clinic_id, service_id, payment_method_id,
            insurance_company_id, price, valid_from
        )
        VALUES (
            'f1600000-0000-0000-0000-000000001004',
            'f1600000-0000-0000-0000-000000000001',
            'f1600000-0000-0000-0000-000000000101',
            'f1600000-0000-0000-0000-000000000302',
            'f1600000-0000-0000-0000-000000000501',
            90,
            CURRENT_DATE + 20
        );
        RAISE EXCEPTION 'TEST_FAILED: insurance without class was accepted';
    EXCEPTION
        WHEN check_violation THEN
            IF SQLERRM = 'TEST_FAILED: insurance without class was accepted' THEN
                RAISE;
            END IF;
    END;

    -- Insurance class mismatch.
    BEGIN
        INSERT INTO geniusbot.prices (
            id, clinic_id, service_id, payment_method_id,
            insurance_company_id, insurance_class_id, price, valid_from
        )
        VALUES (
            'f1600000-0000-0000-0000-000000001005',
            'f1600000-0000-0000-0000-000000000001',
            'f1600000-0000-0000-0000-000000000101',
            'f1600000-0000-0000-0000-000000000302',
            'f1600000-0000-0000-0000-000000000501',
            'f1600000-0000-0000-0000-000000000702',
            90,
            CURRENT_DATE + 20
        );
        RAISE EXCEPTION 'TEST_FAILED: mismatched insurance class was accepted';
    EXCEPTION
        WHEN check_violation THEN
            IF SQLERRM = 'TEST_FAILED: mismatched insurance class was accepted' THEN
                RAISE;
            END IF;
    END;

    -- Negative price.
    BEGIN
        INSERT INTO geniusbot.prices (
            id, clinic_id, service_id, payment_method_id, price, valid_from
        )
        VALUES (
            'f1600000-0000-0000-0000-000000001006',
            'f1600000-0000-0000-0000-000000000001',
            'f1600000-0000-0000-0000-000000000101',
            'f1600000-0000-0000-0000-000000000301',
            -1,
            CURRENT_DATE + 20
        );
        RAISE EXCEPTION 'TEST_FAILED: negative price was accepted';
    EXCEPTION
        WHEN check_violation THEN
            IF SQLERRM = 'TEST_FAILED: negative price was accepted' THEN
                RAISE;
            END IF;
    END;

    -- Invalid dates.
    BEGIN
        INSERT INTO geniusbot.prices (
            id, clinic_id, service_id, payment_method_id,
            price, valid_from, valid_to
        )
        VALUES (
            'f1600000-0000-0000-0000-000000001007',
            'f1600000-0000-0000-0000-000000000001',
            'f1600000-0000-0000-0000-000000000101',
            'f1600000-0000-0000-0000-000000000301',
            100,
            CURRENT_DATE + 30,
            CURRENT_DATE + 20
        );
        RAISE EXCEPTION 'TEST_FAILED: invalid dates were accepted';
    EXCEPTION
        WHEN check_violation THEN
            IF SQLERRM = 'TEST_FAILED: invalid dates were accepted' THEN
                RAISE;
            END IF;
    END;

    -- Overlap rejection.
    BEGIN
        INSERT INTO geniusbot.prices (
            id, clinic_id, service_id, payment_method_id,
            price, valid_from, valid_to, is_active
        )
        VALUES (
            'f1600000-0000-0000-0000-000000001008',
            'f1600000-0000-0000-0000-000000000001',
            'f1600000-0000-0000-0000-000000000101',
            'f1600000-0000-0000-0000-000000000301',
            110,
            CURRENT_DATE + 5,
            CURRENT_DATE + 15,
            true
        );
        RAISE EXCEPTION 'TEST_FAILED: overlapping period was accepted';
    EXCEPTION
        WHEN exclusion_violation THEN NULL;
    END;

    -- Cross-clinic rejection.
    BEGIN
        INSERT INTO geniusbot.prices (
            id, clinic_id, service_id, payment_method_id, price, valid_from
        )
        VALUES (
            'f1600000-0000-0000-0000-000000001009',
            'f1600000-0000-0000-0000-000000000001',
            'f1600000-0000-0000-0000-000000000201',
            'f1600000-0000-0000-0000-000000000301',
            100,
            CURRENT_DATE + 20
        );
        RAISE EXCEPTION 'TEST_FAILED: cross-clinic service was accepted';
    EXCEPTION
        WHEN check_violation THEN
            IF SQLERRM = 'TEST_FAILED: cross-clinic service was accepted' THEN
                RAISE;
            END IF;
    END;

    -- Foreign-key restrict validation.
    BEGIN
        DELETE FROM geniusbot.services
         WHERE id = 'f1600000-0000-0000-0000-000000000101';
        RAISE EXCEPTION 'TEST_FAILED: referenced service was deleted';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;
END;
$tests$ LANGUAGE plpgsql;

-- Adjacent periods accepted.
INSERT INTO geniusbot.prices (
    id,
    clinic_id,
    service_id,
    payment_method_id,
    price,
    valid_from,
    valid_to,
    is_active
)
VALUES (
    'f1600000-0000-0000-0000-000000001010',
    'f1600000-0000-0000-0000-000000000001',
    'f1600000-0000-0000-0000-000000000101',
    'f1600000-0000-0000-0000-000000000301',
    120,
    CURRENT_DATE + 10,
    CURRENT_DATE + 19,
    true
);

-- Currency normalization.
INSERT INTO geniusbot.prices (
    id,
    clinic_id,
    service_id,
    payment_method_id,
    price,
    currency,
    valid_from,
    valid_to,
    is_active
)
VALUES (
    'f1600000-0000-0000-0000-000000001011',
    'f1600000-0000-0000-0000-000000000001',
    'f1600000-0000-0000-0000-000000000101',
    'f1600000-0000-0000-0000-000000000301',
    130,
    ' sar ',
    CURRENT_DATE + 20,
    CURRENT_DATE + 29,
    true
);

DO $assertions$
BEGIN
    IF (
        SELECT p.currency
          FROM geniusbot.prices AS p
         WHERE p.id = 'f1600000-0000-0000-0000-000000001011'
    ) <> 'SAR' THEN
        RAISE EXCEPTION 'TEST_FAILED: currency was not normalized';
    END IF;

    -- View validation.
    IF NOT EXISTS (
        SELECT 1
          FROM geniusbot.vw_current_service_prices AS p
         WHERE p.id = 'f1600000-0000-0000-0000-000000001001'
    ) THEN
        RAISE EXCEPTION 'TEST_FAILED: current cash price is missing from view';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM geniusbot.vw_current_service_prices AS p
         WHERE p.id = 'f1600000-0000-0000-0000-000000001002'
    ) THEN
        RAISE EXCEPTION 'TEST_FAILED: current insurance price is missing from view';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM geniusbot.vw_current_service_prices AS p
         WHERE p.id IN (
             'f1600000-0000-0000-0000-000000001010',
             'f1600000-0000-0000-0000-000000001011'
         )
    ) THEN
        RAISE EXCEPTION 'TEST_FAILED: future price was returned by view';
    END IF;

    RAISE NOTICE 'PRICES_MODULE_TESTS_PASSED';
END;
$assertions$ LANGUAGE plpgsql;

ROLLBACK;
