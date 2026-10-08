-- Video watch tracking: how much of each video lesson a learner has really played.
-- A video is marked complete automatically once 90% of it has been watched.

-- CreateTable
CREATE TABLE `VideoWatch` (
    `enrollmentId` VARCHAR(191) NOT NULL,
    `materialId` VARCHAR(191) NOT NULL,
    `ranges` JSON NOT NULL,
    `watchedSec` INTEGER NOT NULL DEFAULT 0,
    `durationSec` INTEGER NOT NULL DEFAULT 0,
    `positionSec` INTEGER NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastPingAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VideoWatch_materialId_idx`(`materialId`),
    PRIMARY KEY (`enrollmentId`, `materialId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
