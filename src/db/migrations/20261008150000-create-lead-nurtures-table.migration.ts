import { QueryInterface } from 'sequelize';

// One row per WorkR user in the Day 2..Day 15 nurture: where they are in the sequence and when the next step is due.
// All times are stored in UTC, like every other table.
export default {
    async up (queryInterface: QueryInterface) {
        await queryInterface.sequelize.query(`
            CREATE TABLE IF NOT EXISTS lead_nurtures (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id INT UNSIGNED NOT NULL,
                signed_up_at DATETIME NOT NULL,
                status ENUM('active', 'completed', 'stopped') NOT NULL DEFAULT 'active',
                stop_reason VARCHAR(50) NULL,
                next_step TINYINT UNSIGNED NULL,
                next_due_at DATETIME NULL,
                last_sent_step TINYINT UNSIGNED NULL,
                last_sent_at DATETIME NULL,
                lock_token CHAR(36) NULL,
                locked_until DATETIME NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                UNIQUE KEY lead_nurtures_user_id_key (user_id),
                KEY lead_nurtures_status_due_idx (status, next_due_at),
                CONSTRAINT lead_nurtures_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        `);
    },

    async down (queryInterface: QueryInterface) {
        await queryInterface.sequelize.query(`
            DROP TABLE IF EXISTS lead_nurtures;
        `);
    }
};
