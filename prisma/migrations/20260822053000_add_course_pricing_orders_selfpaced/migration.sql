-- Drop old unique index (FK was already dropped by prior partial run)
DROP INDEX `Enrollment_learnerId_batchId_key` ON `Enrollment`;

-- Make batchId nullable for self-paced enrollments
ALTER TABLE `Enrollment` MODIFY `batchId` VARCHAR(191) NULL;

-- CreateTable: OnlineOrder for marketplace purchases
CREATE TABLE IF NOT EXISTS `OnlineOrder` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `learnerId` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `gateway` VARCHAR(191) NOT NULL DEFAULT 'EASEBUZZ',
    `gatewayTxnId` VARCHAR(191) NULL,
    `gatewayOrderId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `gatewayResponse` JSON NULL,
    `enrollmentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OnlineOrder_organizationId_learnerId_idx`(`organizationId`, `learnerId`),
    INDEX `OnlineOrder_gatewayTxnId_idx`(`gatewayTxnId`),
    INDEX `OnlineOrder_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- New unique on learnerId + courseId
CREATE UNIQUE INDEX `Enrollment_learnerId_courseId_key` ON `Enrollment`(`learnerId`, `courseId`);

-- Re-add batch FK as SET NULL (nullable now)
ALTER TABLE `Enrollment` ADD CONSTRAINT `Enrollment_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `Batch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- OnlineOrder -> Course FK
ALTER TABLE `OnlineOrder` ADD CONSTRAINT `OnlineOrder_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
