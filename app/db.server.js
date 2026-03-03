import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

// import { PrismaClient } from "@prisma/client";

// let prisma;

// if (!global.prisma) {
//   global.prisma = new PrismaClient();
// }

// prisma = global.prisma;

// export { prisma };
