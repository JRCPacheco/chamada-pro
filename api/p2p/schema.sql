CREATE TABLE IF NOT EXISTS p2p_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id VARCHAR(40) NOT NULL,
    session_code VARCHAR(12) NOT NULL,
    sender_token_hash CHAR(64) NOT NULL,
    receiver_token_hash CHAR(64) NULL,
    offer_json MEDIUMTEXT NOT NULL,
    answer_json MEDIUMTEXT NULL,
    status ENUM('pending', 'ready', 'consumed') NOT NULL DEFAULT 'pending',
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
    receiver_claimed_at DATETIME NULL,
    answered_at DATETIME NULL,
    consumed_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_session_id (session_id),
    UNIQUE KEY uniq_session_code (session_code),
    KEY idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
