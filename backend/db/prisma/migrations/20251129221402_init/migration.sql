-- ENUMS
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPERADMIN');
CREATE TYPE "UserStatus" AS ENUM ('SUBSCRIBED', 'CANCELLED');
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'CANCELLED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');
CREATE TYPE "GroupLevel" AS ENUM ('ALL', 'OPEN', 'ADVANCED', 'DEPTH');


-- TABLE: User
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "password" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'SUBSCRIBED',
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- TABLE: Group
CREATE TABLE "Group" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "level" "GroupLevel" NOT NULL DEFAULT 'ALL',
    "description" TEXT
);

-- TABLE: Subscription
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "amount" FLOAT NOT NULL,
    "ingressi" INT NOT NULL DEFAULT 32,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- TABLE: UserGroup
CREATE TABLE "UserGroup" (
    "userId" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId","groupId","subscriptionId"),
    CONSTRAINT "UserGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT,
    CONSTRAINT "UserGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT,
    CONSTRAINT "UserGroup_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE
);

-- TABLE: EventCategory
CREATE TABLE "EventCategory" (
    "id" SERIAL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "label" TEXT NOT NULL
);

-- TABLE: Event
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "equipment" TEXT,
    "note" TEXT,
    "location" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "maxSlots" INTEGER NOT NULL DEFAULT 10,
    "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "categoryId" INTEGER NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventCategory"("id") ON DELETE RESTRICT,
    CONSTRAINT "Event_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT
);

-- TABLE: EventSignup
CREATE TABLE "EventSignup" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSignup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    CONSTRAINT "EventSignup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE,
    CONSTRAINT "EventSignup_userId_eventId_key" UNIQUE ("userId","eventId")
);
