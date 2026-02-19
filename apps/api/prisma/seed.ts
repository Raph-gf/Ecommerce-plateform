import {
  PrismaClient,
  Role,
  CouponDiscountType,
} from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcryptjs from 'bcryptjs';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter: adapter });
const SALT_ROUNDS = 10;
const PASSWORD = 'password';

async function main() {
  const password = await bcryptjs.hash(PASSWORD, SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: 'raphael@ecom.com' },
    update: {
      password_hash: password,
      role: Role.ADMIN,
    },
    create: {
      email: 'raphael@ecom.com',
      first_name: 'Raphael',
      last_name: 'Garnier',
      password_hash: password,
      role: Role.ADMIN,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@ecom.com' },
    update: {
      password_hash: password,
      role: Role.CUSTOMER,
    },
    create: {
      email: 'customer@ecom.com',
      first_name: 'Customer',
      last_name: 'First',
      password_hash: password,
      role: Role.CUSTOMER,
    },
  });

  const categories = await prisma.category.createManyAndReturn({
    data: [
      {
        name: 'T-Shirts',
        slug: 't-shirts',
        parent_id: null,
        image_url: 'https://via.placeholder.com/150',
        position: 0,
        description:
          'T-Shirts are a type of clothing that are worn on the body.',
      },
      {
        name: 'Hoodies',
        slug: 'hoodies',
        parent_id: null,
        image_url: 'https://via.placeholder.com/150',
        position: 1,
        description:
          'Hoodies are a type of clothing that are worn on the body.',
      },
      {
        name: 'Hats',
        slug: 'hats',
        parent_id: null,
        image_url: 'https://via.placeholder.com/150',
        position: 2,
        description: 'Hats are a type of clothing that are worn on the body.',
      },
      {
        name: 'Jeans',
        slug: 'jeans',
        parent_id: null,
        image_url: 'https://via.placeholder.com/150',
        position: 3,
        description: 'Jeans are a type of clothing that are worn on the body.',
      },
      {
        name: 'Shoes',
        slug: 'shoes',
        parent_id: null,
        image_url: 'https://via.placeholder.com/150',
        position: 4,
        description: 'Shoes are a type of clothing that are worn on the body.',
      },
    ],
  });

  const products = await prisma.product.createManyAndReturn({
    data: [
      {
        name: 'Classic Crewneck T-Shirt',
        slug: 't-shirt',
        category_id: categories[0].id,
        description: 'T-Shirt is a type of clothing that are worn on the body.',
        base_price: 10.0,
      },
      {
        name: 'Classic Crewneck Hoodie',
        slug: 'classic-crewneck-hoodie',
        category_id: categories[1].id,
        description: 'Hoodie is a type of clothing that are worn on the body.',
        base_price: 20.0,
      },
      {
        name: 'Classic Baseball Cap',
        slug: 'baseball-cap',
        category_id: categories[2].id,
        description:
          'Baseball Cap is a type of clothing that are worn on the body.',
        base_price: 15.0,
      },
      {
        name: 'Classic Jeans',
        slug: 'classic-jeans',
        category_id: categories[3].id,
        description: 'Jeans are a type of clothing that are worn on the body.',
        base_price: 30.0,
      },
      {
        name: 'Classic Sneakers',
        slug: 'classic-sneakers',
        category_id: categories[4].id,
        description:
          'Sneakers are a type of clothing that are worn on the body.',
        base_price: 40.0,
      },
      {
        name: 'Classic Running Shoes',
        slug: 'classic-running-shoes',
        category_id: categories[4].id,
        description:
          'Running Shoes are a type of clothing that are worn on the body.',
        base_price: 50.0,
      },
    ],
  });

  const productsVariants = await prisma.productVariant.createManyAndReturn({
    data: [
      {
        product_id: products[0].id,
        sku: 'TS-001',
        price: 10.0,
        stock_quantity: 100,
      },
      {
        product_id: products[1].id,
        sku: 'HH-001',
        price: 20.0,
        stock_quantity: 100,
      },
      {
        product_id: products[2].id,
        sku: 'BC-001',
        price: 15.0,
        stock_quantity: 100,
      },
      {
        product_id: products[3].id,
        sku: 'JJ-001',
        price: 30.0,
        stock_quantity: 100,
      },
      {
        product_id: products[4].id,
        sku: 'CS-001',
        price: 40.0,
        stock_quantity: 100,
      },
      {
        product_id: products[5].id,
        sku: 'RS-001',
        price: 50.0,
        stock_quantity: 100,
      },
    ],
  });

  const coupon = await prisma.coupon.upsert({
    where: { code: '10OFF' },
    update: {
      discount_type: CouponDiscountType.PERCENTAGE,
      discount_value: 10.0,
      expiry_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days from now
    },
    create: {
      code: '10OFF',
      discount_type: CouponDiscountType.PERCENTAGE,
      discount_value: 10.0,
      expiry_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days from now
    },
  });

  console.log('User created:', admin, customer);
  console.log('Categories created:', categories);
  console.log('Products created:', products);
  console.log('Products Variants created:', productsVariants);
  console.log('Coupon created:', coupon);
}
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
