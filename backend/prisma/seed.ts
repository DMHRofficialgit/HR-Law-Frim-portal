import { PrismaClient, OnboardingStatus, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureSystemCaseCategories } from "../src/lib/caseCategories";
import { ensureFoldersForOrganisation } from "../src/lib/folders";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/uploadSettings";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin123!", 10);
  const clientHash = await bcrypt.hash("Client123!", 10);

  await prisma.uploadSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      ...DEFAULT_UPLOAD_SETTINGS,
    },
  });

  await prisma.smtpSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      fromDisplayName: "DM.HR Group",
      fromAddress: null,
    },
  });

  await ensureSystemCaseCategories();

  const admin = await prisma.user.upsert({
    where: { email: "admin@dmhr.local" },
    update: {
      name: "DM.HR Admin",
      role: UserRole.admin,
      passwordHash,
      organisationId: null,
      mustChangePassword: false,
      status: "active",
    },
    create: {
      email: "admin@dmhr.local",
      name: "DM.HR Admin",
      role: UserRole.admin,
      passwordHash,
      organisationId: null,
      mustChangePassword: false,
      status: "active",
    },
  });

  const orgA = await prisma.organisation.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {
      name: "ABC Homecare",
      ref: "DM-001",
      contactName: "Emma Thompson",
      email: "emma@abchomecare.example",
      type: "Adult Social Care",
      onboardingStatus: OnboardingStatus.existing_skip,
      status: "active",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "ABC Homecare",
      ref: "DM-001",
      contactName: "Emma Thompson",
      email: "emma@abchomecare.example",
      phone: "0121 555 0182",
      type: "Adult Social Care",
      onboardingStatus: OnboardingStatus.existing_skip,
      status: "active",
    },
  });

  const orgB = await prisma.organisation.upsert({
    where: { id: "00000000-0000-4000-8000-000000000002" },
    update: {
      name: "Oakfield Children's Services",
      ref: "DM-002",
      contactName: "Rachel Morgan",
      email: "rachel@oakfield.example",
      type: "Children's Residential Care",
      onboardingStatus: OnboardingStatus.in_progress,
      status: "active",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Oakfield Children's Services",
      ref: "DM-002",
      contactName: "Rachel Morgan",
      email: "rachel@oakfield.example",
      phone: "0161 555 0124",
      type: "Children's Residential Care",
      onboardingStatus: OnboardingStatus.in_progress,
      status: "active",
    },
  });

  const allOrgs = await prisma.organisation.findMany({ select: { id: true } });
  for (const org of allOrgs) {
    await ensureFoldersForOrganisation(prisma, org.id);
  }

  const clientA = await prisma.user.upsert({
    where: { email: "client.a@example.test" },
    update: {
      name: "Emma Thompson",
      role: UserRole.client,
      organisationId: orgA.id,
      passwordHash: clientHash,
      mustChangePassword: false,
      status: "active",
    },
    create: {
      email: "client.a@example.test",
      name: "Emma Thompson",
      role: UserRole.client,
      organisationId: orgA.id,
      passwordHash: clientHash,
      mustChangePassword: false,
      status: "active",
    },
  });

  const clientB = await prisma.user.upsert({
    where: { email: "client.b@example.test" },
    update: {
      name: "Rachel Morgan",
      role: UserRole.client,
      organisationId: orgB.id,
      passwordHash: clientHash,
      mustChangePassword: false,
      status: "active",
    },
    create: {
      email: "client.b@example.test",
      name: "Rachel Morgan",
      role: UserRole.client,
      organisationId: orgB.id,
      passwordHash: clientHash,
      mustChangePassword: false,
      status: "active",
    },
  });

  await prisma.employee.upsert({
    where: { id: "00000000-0000-4000-8000-0000000000e1" },
    update: {
      name: "Jordan Ellis",
      jobTitle: "Senior Care Assistant",
      department: "Residential Care",
      organisationId: orgA.id,
    },
    create: {
      id: "00000000-0000-4000-8000-0000000000e1",
      organisationId: orgA.id,
      name: "Jordan Ellis",
      jobTitle: "Senior Care Assistant",
      department: "Residential Care",
      startDate: new Date("2024-03-18"),
      createdById: clientA.id,
    },
  });

  await prisma.employee.upsert({
    where: { id: "00000000-0000-4000-8000-0000000000e2" },
    update: {
      name: "Alex Morgan",
      jobTitle: "Children's Residential Support Worker",
      department: "Residential Services",
      organisationId: orgB.id,
    },
    create: {
      id: "00000000-0000-4000-8000-0000000000e2",
      organisationId: orgB.id,
      name: "Alex Morgan",
      jobTitle: "Children's Residential Support Worker",
      department: "Residential Services",
      startDate: new Date("2023-06-12"),
      createdById: clientB.id,
    },
  });

  console.log("Seed complete:");
  console.log({
    admin: admin.email,
    organisations: [orgA.name, orgB.name],
    clients: [clientA.email, clientB.email],
    employees: 2,
    caseCategories: "system defaults",
  });
  console.log("Passwords → admin: Admin123! | clients: Client123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
