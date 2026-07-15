/**
 * DEMO SEED — full presentable mock data.
 *   npm run db:demo
 *
 * Optional: put any small .mp4 at  demo-assets/sample.mp4  BEFORE running,
 * and every video lesson becomes actually playable in the player.
 * (Without it, video lessons are skipped and PDFs/quizzes still demo perfectly.)
 *
 * LOGINS CREATED (all passwords ready — no forced change, demo-friendly):
 *   Super Admin : superadmin@quastech.demo / Admin@123
 *   Admin       : admin@quastech.demo      / Admin@123
 *   Branch Admin: branchadmin@quastech.demo/ Admin@123
 *   Instructor  : instructor@quastech.demo / Teach@123
 *   Student 1   : student1@quastech.demo   / Learn@123   (Full Stack, fees pending)
 *   Student 2   : student2@quastech.demo   / Learn@123   (both courses, one completed + certificate)
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const STORAGE = path.resolve(process.env.LOCAL_STORAGE_PATH ?? './storage');

async function putFile(key: string, data: Buffer) {
  const p = path.join(STORAGE, key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
  return key;
}

async function makePdf(title: string, lines: string[]): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  doc.fontSize(22).text(title).moveDown();
  doc.fontSize(12);
  for (const l of lines) doc.text(l).moveDown(0.5);
  doc.end();
  return done;
}

async function main() {
  console.log('🌱 Seeding demo data…');

  // ── Org + branches ──
  const org = await prisma.organization.upsert({
    where: { id: 'seed-org' },
    update: {},
    create: { id: 'seed-org', name: 'QUASTECH Institute', receiptPrefix: 'QST' },
  });
  const thane = await prisma.branch.upsert({
    where: { id: 'br-thane' }, update: {},
    create: { id: 'br-thane', organizationId: org.id, name: 'Thane Center', city: 'Thane', state: 'Maharashtra' },
  });
  const blr = await prisma.branch.upsert({
    where: { id: 'br-blr' }, update: {},
    create: { id: 'br-blr', organizationId: org.id, name: 'Bangalore Center', city: 'Bangalore', state: 'Karnataka' },
  });
  // extra branches so the State → City → Branch cascade has real data to filter
  await prisma.branch.upsert({
    where: { id: 'br-pune' }, update: {},
    create: { id: 'br-pune', organizationId: org.id, name: 'Pune Center', city: 'Pune', state: 'Maharashtra' },
  });
  await prisma.branch.upsert({
    where: { id: 'br-andheri' }, update: {},
    create: { id: 'br-andheri', organizationId: org.id, name: 'Andheri Center', city: 'Mumbai', state: 'Maharashtra' },
  });

  // ── Users (all roles, demo passwords, no forced change) ──
  const mk = async (email: string, name: string, role: any, pass: string, branchId: string, lifecycle?: any) =>
    prisma.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email } },
      update: { passwordHash: await bcrypt.hash(pass, 12), mustChangePassword: false },
      create: {
        organizationId: org.id, branchId, role, name, email,
        passwordHash: await bcrypt.hash(pass, 12), mustChangePassword: false, lifecycle,
        phone: `98${Math.floor(10000000 + Math.random() * 89999999)}`,
      },
    });

  await mk('superadmin@quastech.demo', 'Super Admin', 'SUPER_ADMIN', 'Admin@123', thane.id);
  await mk('admin@quastech.demo', 'Priya Sharma (Admin)', 'ADMIN', 'Admin@123', thane.id);
  await mk('branchadmin@quastech.demo', 'Rahul Verma (Branch Admin)', 'BRANCH_ADMIN', 'Admin@123', blr.id);
  const instructor = await mk('instructor@quastech.demo', 'Prof. Anil Kumar', 'INSTRUCTOR', 'Teach@123', thane.id);
  const student1 = await mk('student1@quastech.demo', 'Aisha Khan', 'STUDENT', 'Learn@123', thane.id, 'ACTIVE');
  const student2 = await mk('student2@quastech.demo', 'Rohan Patil', 'STUDENT', 'Learn@123', thane.id, 'ACTIVE');

  // ── Demo files ──
  const pdf1 = await putFile(`org/${org.id}/material/html-notes.pdf`, await makePdf('HTML & CSS — Lecture Notes', [
    'HTML gives a page its structure; CSS gives it style.',
    'Key tags: <header>, <main>, <section>, <footer>.',
    'The box model: content → padding → border → margin.',
    'Flexbox aligns items in one dimension; Grid handles two.',
  ]));
  const pdf2 = await putFile(`org/${org.id}/material/python-notes.pdf`, await makePdf('Python Basics — Lecture Notes', [
    'Variables are dynamically typed: x = 10, name = "Asha".',
    'Lists, tuples, dicts and sets are the core collections.',
    'pandas DataFrames are the workhorse of data science.',
  ]));

  // optional real video
  let videoKey: string | null = null;
  try {
    const sample = await fs.readFile(path.resolve('demo-assets/sample.mp4'));
    videoKey = await putFile(`org/${org.id}/material/sample-lecture.mp4`, sample);
    console.log('  🎬 sample.mp4 found — video lessons will be playable');
  } catch {
    console.log('  ⚠ demo-assets/sample.mp4 not found — video lessons skipped (PDF/quiz still demo fine)');
  }

  // ── Course 1: Full Stack Web Development ──
  const course1 = await prisma.course.upsert({
    where: { id: 'course-fullstack' }, update: {},
    create: { id: 'course-fullstack', organizationId: org.id, title: 'Full Stack Web Development',
      description: 'HTML, CSS, JavaScript, React and Node — job-ready in 6 months.',
      category: 'Development', status: 'PUBLISHED', visibility: 'PUBLIC' },
  });
  const m1 = await prisma.module.upsert({ where: { id: 'mod-frontend' }, update: {},
    create: { id: 'mod-frontend', organizationId: org.id, title: 'Frontend Fundamentals' } });
  const m2 = await prisma.module.upsert({ where: { id: 'mod-react' }, update: {},
    create: { id: 'mod-react', organizationId: org.id, title: 'React Basics' } });
  await prisma.courseModule.upsert({ where: { courseId_moduleId: { courseId: course1.id, moduleId: m1.id } }, update: {},
    create: { courseId: course1.id, moduleId: m1.id, position: 0 } });
  await prisma.courseModule.upsert({ where: { courseId_moduleId: { courseId: course1.id, moduleId: m2.id } }, update: {},
    create: { courseId: course1.id, moduleId: m2.id, position: 1 } });

  const s1 = await prisma.section.upsert({ where: { id: 'sec-html' }, update: {},
    create: { id: 'sec-html', moduleId: m1.id, title: 'HTML & CSS', position: 0 } });
  const s2 = await prisma.section.upsert({ where: { id: 'sec-react' }, update: {},
    create: { id: 'sec-react', moduleId: m2.id, title: 'Getting started with React', position: 0 } });

  const mat = async (id: string, sectionId: string, type: any, title: string, position: number, extra: any = {}) =>
    prisma.material.upsert({ where: { id }, update: {},
      create: { id, sectionId, type, title, position, status: 'published', ...extra } });

  const c1Materials: string[] = [];
  if (videoKey) { await mat('mat-html-video', s1.id, 'VIDEO', 'Lecture 1: HTML crash course', 0, { fileKey: videoKey, durationSec: 300 }); c1Materials.push('mat-html-video'); }
  await mat('mat-html-pdf', s1.id, 'PDF', 'HTML & CSS lecture notes', 1, { fileKey: pdf1 }); c1Materials.push('mat-html-pdf');
  await mat('mat-html-quiz', s1.id, 'QUIZ', 'Quiz: HTML & CSS basics', 2, { quizSchema: {
    attemptsAllowed: 3, shuffle: true, showAnswers: true, timeLimitMin: 10,
    questions: [
      { id: 'q1', text: 'Which tag creates the largest heading?', options: ['<h6>', '<h1>', '<head>', '<header>'], correct: [1], marks: 2, negative: 0.5 },
      { id: 'q2', text: 'CSS stands for…', options: ['Cascading Style Sheets', 'Creative Style System', 'Computer Styled Sections'], correct: [0], marks: 2, negative: 0 },
      { id: 'q3', text: 'Which are CSS layout systems? (choose 2)', options: ['Flexbox', 'JSONBox', 'Grid', 'Tablebox'], correct: [0, 2], marks: 3, negative: 1 },
    ],
  } }); c1Materials.push('mat-html-quiz');
  if (videoKey) { await mat('mat-react-video', s2.id, 'VIDEO', 'Lecture 2: React components', 0, { fileKey: videoKey, durationSec: 420 }); c1Materials.push('mat-react-video'); }
  await mat('mat-react-assign', s2.id, 'ASSIGNMENT', 'Assignment: Build a profile card component', 1, {
    quizSchema: { dueAt: new Date(Date.now() + 7 * 86400_000).toISOString() } }); c1Materials.push('mat-react-assign');
  await mat('mat-react-link', s2.id, 'LINK', 'Official React documentation', 2, { quizSchema: { url: 'https://react.dev' } }); c1Materials.push('mat-react-link');

  // ── Course 2: Python for Data Science ──
  const course2 = await prisma.course.upsert({
    where: { id: 'course-python' }, update: {},
    create: { id: 'course-python', organizationId: org.id, title: 'Python for Data Science',
      description: 'Python, pandas and visualization for absolute beginners.',
      category: 'Data Science', status: 'PUBLISHED', visibility: 'PUBLIC' },
  });
  const m3 = await prisma.module.upsert({ where: { id: 'mod-python' }, update: {},
    create: { id: 'mod-python', organizationId: org.id, title: 'Python Foundations' } });
  await prisma.courseModule.upsert({ where: { courseId_moduleId: { courseId: course2.id, moduleId: m3.id } }, update: {},
    create: { courseId: course2.id, moduleId: m3.id, position: 0 } });
  const s3 = await prisma.section.upsert({ where: { id: 'sec-python' }, update: {},
    create: { id: 'sec-python', moduleId: m3.id, title: 'Python basics', position: 0 } });

  const c2Materials: string[] = [];
  if (videoKey) { await mat('mat-py-video', s3.id, 'VIDEO', 'Lecture 1: Python setup & syntax', 0, { fileKey: videoKey, durationSec: 360 }); c2Materials.push('mat-py-video'); }
  await mat('mat-py-pdf', s3.id, 'PDF', 'Python basics — notes', 1, { fileKey: pdf2 }); c2Materials.push('mat-py-pdf');
  await mat('mat-py-quiz', s3.id, 'QUIZ', 'Quiz: Python fundamentals', 2, { quizSchema: {
    attemptsAllowed: 2, shuffle: false, showAnswers: true, timeLimitMin: 5,
    questions: [
      { id: 'p1', text: 'Which library is used for DataFrames?', options: ['numpy', 'pandas', 'flask'], correct: [1], marks: 2, negative: 0 },
      { id: 'p2', text: 'Python lists are…', options: ['immutable', 'mutable'], correct: [1], marks: 1, negative: 0 },
    ],
  } }); c2Materials.push('mat-py-quiz');

  // ── Batches + sessions ──
  const batch1 = await prisma.batch.upsert({ where: { id: 'batch-fs-a' }, update: {},
    create: { id: 'batch-fs-a', courseId: course1.id, branchId: thane.id, instructorId: instructor.id,
      name: 'Full Stack — Morning Batch A', startDate: new Date(Date.now() - 14 * 86400_000), capacity: 30 } });
  const batch2 = await prisma.batch.upsert({ where: { id: 'batch-py-a' }, update: {},
    create: { id: 'batch-py-a', courseId: course2.id, branchId: thane.id, instructorId: instructor.id,
      name: 'Python — Weekend Batch', startDate: new Date(Date.now() - 30 * 86400_000), capacity: 25 } });

  const pastSession = await prisma.classSession.upsert({ where: { id: 'sess-past' }, update: {},
    create: { id: 'sess-past', batchId: batch1.id, title: 'HTML deep dive (held)',
      scheduledAt: new Date(Date.now() - 3 * 86400_000), startedAt: new Date(Date.now() - 3 * 86400_000),
      meetLink: 'https://meet.google.com/demo-past' } });
  await prisma.classSession.upsert({ where: { id: 'sess-today' }, update: {},
    create: { id: 'sess-today', batchId: batch1.id, title: 'CSS Flexbox live class',
      scheduledAt: new Date(Date.now() + 2 * 3600_000), meetLink: 'https://meet.google.com/demo-today' } });
  await prisma.classSession.upsert({ where: { id: 'sess-tmrw' }, update: {},
    create: { id: 'sess-tmrw', batchId: batch1.id, title: 'JavaScript intro',
      scheduledAt: new Date(Date.now() + 26 * 3600_000), meetLink: 'https://meet.google.com/demo-tmrw' } });

  // ── Enrollments + fees (receipted) ──
  const enroll = async (id: string, learnerId: string, courseId: string, batchId: string,
    totalFee: number, discount: number, paid: number, assignedById: string) => {
    const e = await prisma.enrollment.upsert({ where: { id }, update: {},
      create: { id, learnerId, courseId, batchId, assignedById, status: 'ACTIVE' } });
    const fee = await prisma.feeAccount.upsert({ where: { enrollmentId: e.id }, update: {},
      create: { enrollmentId: e.id, totalFee: new Prisma.Decimal(totalFee),
        discount: new Prisma.Decimal(discount), pendingAmount: new Prisma.Decimal(totalFee - discount - paid) } });
    if (paid > 0) {
      const counter = await prisma.receiptCounter.upsert({
        where: { organizationId_year: { organizationId: org.id, year: new Date().getFullYear() } },
        update: { seq: { increment: 1 } },
        create: { organizationId: org.id, year: new Date().getFullYear(), seq: 1 } });
      await prisma.feePayment.upsert({ where: { receiptNo: `QST-${new Date().getFullYear()}-${String(counter.seq).padStart(5, '0')}` }, update: {},
        create: { feeAccountId: fee.id, amount: new Prisma.Decimal(paid), mode: 'UPI',
          referenceNo: `UPI-DEMO-${counter.seq}`, receiptNo: `QST-${new Date().getFullYear()}-${String(counter.seq).padStart(5, '0')}`,
          receivedById: assignedById } });
    }
    return e;
  };
  const admin = (await prisma.user.findFirst({ where: { email: 'admin@quastech.demo' } }))!;
  const e1 = await enroll('enr-s1-fs', student1.id, course1.id, batch1.id, 25000, 2000, 10000, admin.id); // ₹13,000 pending
  const e2 = await enroll('enr-s2-fs', student2.id, course1.id, batch1.id, 25000, 0, 25000, admin.id);    // fully paid
  const e3 = await enroll('enr-s2-py', student2.id, course2.id, batch2.id, 12000, 1000, 11000, admin.id); // fully paid

  // ── Attendance on the past session ──
  for (const [learnerId, present] of [[student1.id, true], [student2.id, true]] as const)
    await prisma.attendance.upsert({
      where: { sessionId_learnerId: { sessionId: pastSession.id, learnerId } }, update: {},
      create: { sessionId: pastSession.id, learnerId, present, markedById: instructor.id } });

  // ── Progress: student2 completed Python course (100%) → certificate ──
  for (const matId of c2Materials)
    await prisma.materialProgress.upsert({
      where: { enrollmentId_materialId: { enrollmentId: e3.id, materialId: matId } },
      update: {}, create: { enrollmentId: e3.id, materialId: matId } });
  await prisma.enrollment.update({ where: { id: e3.id },
    data: { progressPct: new Prisma.Decimal(100), status: 'COMPLETED' } });
  // partial progress on Full Stack for both students
  if (c1Materials[0]) {
    await prisma.materialProgress.upsert({
      where: { enrollmentId_materialId: { enrollmentId: e2.id, materialId: c1Materials[0] } },
      update: {}, create: { enrollmentId: e2.id, materialId: c1Materials[0] } });
    await prisma.enrollment.update({ where: { id: e2.id },
      data: { progressPct: new Prisma.Decimal(Math.round((1 / c1Materials.length) * 100)) } });
  }

  // certificate (PDF rendered inline so it downloads immediately)
  const existingCert = await prisma.certificate.findFirst({ where: { enrollmentId: e3.id } });
  if (!existingCert) {
    const verifyCode = crypto.randomBytes(5).toString('hex').toUpperCase();
    const certPdf = await makePdf('Certificate of Completion', [
      '', 'This certifies that', 'ROHAN PATIL',
      'has successfully completed', 'Python for Data Science',
      '', `Issued: ${new Date().toDateString()}`, `Verification code: ${verifyCode}`,
    ]);
    const certKey = await putFile(`org/${org.id}/certificates/demo-cert.pdf`, certPdf);
    await prisma.certificate.create({ data: { enrollmentId: e3.id, verifyCode, pdfKey: certKey } });
    console.log(`  🎓 Certificate issued — verify at /verify/${verifyCode}`);
  }

  // ── Published quiz result for student2 (Results page demo) ──
  await prisma.submission.upsert({
    where: { materialId_learnerId: { materialId: 'mat-py-quiz', learnerId: student2.id } }, update: {},
    create: { materialId: 'mat-py-quiz', learnerId: student2.id, status: 'PUBLISHED',
      marks: new Prisma.Decimal(3), attemptsUsed: 1, answers: { p1: [1], p2: [1] },
      feedback: 'Great fundamentals — keep going!' } });
  // Pending assignment from student1 (Evaluation queue demo)
  const assignFile = await putFile(`org/${org.id}/assignment/demo-submission.pdf`,
    await makePdf('Assignment Submission — Aisha Khan', ['My profile card component', 'Built with React function components and props.']));
  await prisma.submission.upsert({
    where: { materialId_learnerId: { materialId: 'mat-react-assign', learnerId: student1.id } }, update: {},
    create: { materialId: 'mat-react-assign', learnerId: student1.id, status: 'PENDING', fileKey: assignFile } });

  // ── Feedback (instructor rating) + enquiries + notifications ──
  const form = await prisma.feedbackForm.upsert({ where: { id: 'fb-batch1' }, update: {},
    create: { id: 'fb-batch1', organizationId: org.id, title: 'Rate your trainer — Batch A',
      formSchema: { fields: [{ type: 'rating', label: 'Overall' }] },
      targetType: 'BATCH', targetId: batch1.id, allowAnonymous: true, createdById: admin.id } });
  for (const [rid, rating] of [[student1.id, 5], [student2.id, 4]] as const) {
    const dup = await prisma.feedbackResponse.findFirst({ where: { formId: form.id, respondentId: rid } });
    if (!dup) await prisma.feedbackResponse.create({
      data: { formId: form.id, respondentId: rid, rating, answers: { Overall: rating } } });
  }
  for (const [id, name, phone, interest] of [
    ['enq-1', 'Sneha Joshi', '9812345670', 'Full Stack Web Development'],
    ['enq-2', 'Vikram Singh', '9812345671', 'Python for Data Science'],
  ] as const)
    await prisma.enquiry.upsert({ where: { id }, update: {},
      create: { id, organizationId: org.id, name, phone, courseInterest: interest, source: 'website' } });

  for (const [uid, title, body] of [
    [student1.id, 'Welcome to QUASTECH!', 'Your Full Stack course is live. Start learning today.'],
    [student2.id, 'Certificate issued 🎓', 'Your Python for Data Science certificate is ready to download.'],
  ] as const)
    await prisma.notification.create({ data: { userId: uid, type: 'DEMO', title, body } }).catch(() => {});

  console.log(`
✅ DEMO READY — login and present:

  ADMIN SIDE                                   STUDENT SIDE
  superadmin@quastech.demo  / Admin@123        student1@quastech.demo / Learn@123
  admin@quastech.demo       / Admin@123          → Full Stack course, ₹13,000 pending fee,
  branchadmin@quastech.demo / Admin@123            assignment awaiting evaluation
  instructor@quastech.demo  / Teach@123        student2@quastech.demo / Learn@123
                                                 → 2 courses, Python COMPLETED,
                                                   certificate + published result

  What to demo: Admin dashboard KPIs · pending-fee report · enroll wizard ·
  course builder · Instructor: today's session "Start", attendance, evaluation
  queue (Aisha's assignment is waiting) · Student: player (PDF opens, quiz is
  attemptable live), certificate download, notifications.
`);
}

main().then(() => seedMergedFeatures()).then(() => seedIntegrations()).catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

/* ── Merged-feature demo data (v3.0): categories, announcement, badges, points, review, QnA ── */
export async function seedMergedFeatures() {
  const org = await prisma.organization.findFirst({ where: { id: 'seed-org' } });
  if (!org) return;
  const dev = await prisma.category.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Development' } },
    update: {}, create: { organizationId: org.id, name: 'Development' } });
  const ds = await prisma.category.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Data Science' } },
    update: {}, create: { organizationId: org.id, name: 'Data Science' } });
  await prisma.course.update({ where: { id: 'course-fullstack' }, data: { categoryId: dev.id } }).catch(() => {});
  await prisma.course.update({ where: { id: 'course-python' }, data: { categoryId: ds.id } }).catch(() => {});

  const admin = await prisma.user.findFirst({ where: { email: 'admin@quastech.demo' } });
  const s2 = await prisma.user.findFirst({ where: { email: 'student2@quastech.demo' } });
  if (admin) {
    const exists = await prisma.announcement.findFirst({ where: { organizationId: org.id, title: 'Welcome to the new QUASTECH OS!' } });
    if (!exists) await prisma.announcement.create({ data: {
      organizationId: org.id, title: 'Welcome to the new QUASTECH OS!',
      message: 'Our upgraded learning platform is live — check the leaderboard, earn badges, and ask questions right inside your lessons.',
      audience: 'ALL', createdById: admin.id } });
  }
  if (s2) {
    const { ensureBadges, addPoints } = await import('../src/lib/gamify');
    await ensureBadges();
    await addPoints(org.id, s2.id, 150, 'demo_seed');
    await prisma.courseReview.upsert({
      where: { courseId_learnerId: { courseId: 'course-python', learnerId: s2.id } },
      update: {}, create: { courseId: 'course-python', learnerId: s2.id, rating: 5, comment: 'Great course, very practical!' } });
    const q = await prisma.courseQnA.findFirst({ where: { courseId: 'course-python', parentId: null } });
    if (!q) await prisma.courseQnA.create({ data: {
      courseId: 'course-python', materialId: 'mat-py-pdf', userId: s2.id,
      content: 'Which pandas version should we install for the exercises?' } });
  }
  console.log('  🧩 merged-feature demo data ready (categories, announcement, badges, points, review, QnA)');
}

/** Registers the .env SMTP settings as a ready-made integration entry (v3.4). */
export async function seedIntegrations() {
  const org = await prisma.organization.findFirst({ where: { id: 'seed-org' } });
  const su = await prisma.user.findFirst({ where: { email: 'superadmin@quastech.demo' } });
  if (!org || !su || !process.env.SMTP_HOST) return;
  const exists = await prisma.integration.findFirst({ where: { organizationId: org.id, provider: 'SMTP' } });
  if (exists) return;
  const { encryptJson } = await import('../src/lib/crypto');
  const row = await prisma.integration.create({
    data: {
      organizationId: org.id, provider: 'SMTP',
      name: `Email — ${process.env.SMTP_USER ?? 'configured in .env'}`,
      config: { host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER, from: process.env.SMTP_FROM ?? process.env.SMTP_USER },
      secrets: encryptJson({ pass: process.env.SMTP_PASS ?? '' }),
      isActive: true, createdById: su.id,
    },
  });
  await prisma.integrationHistory.create({
    data: { integrationId: row.id, organizationId: org.id, provider: 'SMTP', name: row.name,
      config: row.config as any, secrets: row.secrets, action: 'CREATED',
      note: 'Imported from the .env file', changedById: su.id },
  });
  console.log('  🔌 SMTP integration imported into the Super Admin panel');
}
