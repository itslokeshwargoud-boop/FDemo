import { PrismaClient, AlertSeverity, AlertStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo user
  const passwordHash = await bcrypt.hash('password123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@repscan.io' },
    update: {},
    create: {
      email: 'admin@repscan.io',
      name: 'Admin User',
      passwordHash,
    },
  });
  console.log(`✅ Created user: ${user.email}`);

  // Create metric snapshots for last 30 days
  const now = new Date();
  const metrics = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    metrics.push({
      date,
      totalUsers: 1000 + Math.floor(Math.random() * 500) + i * 10,
      activeUsers: 200 + Math.floor(Math.random() * 150) + i * 3,
      totalRevenue: 5000 + Math.random() * 3000 + i * 100,
      conversionRate: 2.5 + Math.random() * 2,
      pageViews: 5000 + Math.floor(Math.random() * 3000) + i * 50,
      sessions: 1500 + Math.floor(Math.random() * 800) + i * 15,
      bounceRate: 30 + Math.random() * 20,
      avgSessionDuration: 120 + Math.random() * 180,
    });
  }

  for (const metric of metrics) {
    await prisma.metricSnapshot.upsert({
      where: { date: metric.date },
      update: metric,
      create: metric,
    });
  }
  console.log(`✅ Created ${metrics.length} metric snapshots`);

  // Create alerts
  const alertData = [
    {
      title: 'High CPU Usage',
      message: 'Server CPU usage exceeded 90% for 5 minutes',
      severity: AlertSeverity.CRITICAL,
      status: AlertStatus.ACTIVE,
      source: 'monitoring',
    },
    {
      title: 'New User Spike',
      message: 'User registrations increased by 200% in the last hour',
      severity: AlertSeverity.INFO,
      status: AlertStatus.ACTIVE,
      source: 'analytics',
    },
    {
      title: 'Payment Gateway Timeout',
      message: 'Payment processing latency exceeded 5s threshold',
      severity: AlertSeverity.HIGH,
      status: AlertStatus.ACKNOWLEDGED,
      source: 'payments',
    },
    {
      title: 'Database Connection Pool',
      message: 'Connection pool utilization at 85%',
      severity: AlertSeverity.MEDIUM,
      status: AlertStatus.ACTIVE,
      source: 'database',
    },
    {
      title: 'SSL Certificate Expiry',
      message: 'SSL certificate expires in 14 days',
      severity: AlertSeverity.LOW,
      status: AlertStatus.ACTIVE,
      source: 'security',
    },
    {
      title: 'Conversion Rate Drop',
      message: 'Conversion rate dropped by 15% compared to last week',
      severity: AlertSeverity.HIGH,
      status: AlertStatus.ACTIVE,
      source: 'analytics',
    },
    {
      title: 'API Rate Limit Warning',
      message: 'Third-party API rate limit at 80% capacity',
      severity: AlertSeverity.MEDIUM,
      status: AlertStatus.RESOLVED,
      source: 'integrations',
    },
    {
      title: 'Memory Usage Alert',
      message: 'Application memory usage exceeded 75%',
      severity: AlertSeverity.MEDIUM,
      status: AlertStatus.ACTIVE,
      source: 'monitoring',
    },
  ];

  for (const alert of alertData) {
    await prisma.alert.create({ data: alert });
  }
  console.log(`✅ Created ${alertData.length} alerts`);

  console.log('🌱 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
