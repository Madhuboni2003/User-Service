import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model } from 'sequelize';

import { LeadNurtureStatus } from '../../utils/enums/LeadNurtureStatus.enum';
import sequelize from './sequelize';
import User from './user.model';

class LeadNurture extends Model<InferAttributes<LeadNurture>, InferCreationAttributes<LeadNurture>> {
    declare id: CreationOptional<number>;
    declare userId: ForeignKey<User['id']>;
    declare signedUpAt: Date;
    declare status: CreationOptional<LeadNurtureStatus>;
    declare stopReason: CreationOptional<string | null>;
    // The nurture day that is due next (2, 4, 7, ...) and when. Both null once the sequence is completed or stopped.
    declare nextStep: CreationOptional<number | null>;
    declare nextDueAt: CreationOptional<Date | null>;
    declare lastSentStep: CreationOptional<number | null>;
    declare lastSentAt: CreationOptional<Date | null>;
    // A scheduler instance claims a row by writing its token here until lockedUntil; stops two instances working on one row.
    declare lockToken: CreationOptional<string | null>;
    declare lockedUntil: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

LeadNurture.init({
    id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },

    userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        unique: true
    },

    signedUpAt: {
        type: DataTypes.DATE,
        allowNull: false
    },

    status: {
        type: DataTypes.ENUM(...Object.values(LeadNurtureStatus)),
        allowNull: false,
        defaultValue: LeadNurtureStatus.ACTIVE
    },

    stopReason: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null
    },

    nextStep: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: true,
        defaultValue: null
    },

    nextDueAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    },

    lastSentStep: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: true,
        defaultValue: null
    },

    lastSentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    },

    lockToken: {
        type: DataTypes.CHAR(36),
        allowNull: true,
        defaultValue: null
    },

    lockedUntil: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    },

    createdAt: {
        type: DataTypes.DATE,
        allowNull: false
    },

    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
    }
}, {
    tableName: 'lead_nurtures',
    sequelize,
    underscored: true,
    timestamps: true
});

export default LeadNurture;
