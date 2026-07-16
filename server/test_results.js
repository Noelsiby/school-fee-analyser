const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTest() {
  try {
    const exam = await prisma.exam.findFirst({
      where: { name: 'textexam' }
    });
    
    if (!exam) {
      console.log('No exam found');
      return;
    }

    console.log('Testing export / results logic on exam:', exam.id);

    // Call the same logic used in the controller
    const req = { params: { id: exam.id } };
    const res = {
      json: (data) => console.log('Response JSON keys:', Object.keys(data), '| ClassResults length:', data.classResults?.length),
      status: (code) => ({ json: (err) => console.error(code, err) })
    };

    const adminController = require('./controllers/adminController');
    await adminController.getExamResults(req, res);

  } catch (err) {
    console.error(err);
  } finally {
    prisma.$disconnect();
  }
}

runTest();
