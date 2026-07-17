const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get the latest published exam
const getLatestPublishedExam = async () => {
  return await prisma.exam.findFirst({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
    include: {
      enrollments: { include: { class: true } },
      class: true
    }
  });
};

exports.getPublicClasses = async (req, res) => {
  try {
    const publishedExam = await getLatestPublishedExam();
    
    if (!publishedExam) {
      return res.json({ publishedExam: null, classes: [] });
    }

    let classes = [];
    if (publishedExam.examType === 'INTERNAL_EXAM') {
      classes = publishedExam.enrollments.map(e => e.class);
    } else if (publishedExam.class) {
      classes = [publishedExam.class];
    }

    res.json({
      publishedExam: {
        id: publishedExam.id,
        name: publishedExam.name,
        publishedAt: publishedExam.publishedAt
      },
      classes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPublicResults = async (req, res) => {
  try {
    const classId = Number(req.params.classId);
    const publishedExam = await getLatestPublishedExam();
    
    if (!publishedExam) {
      return res.status(403).json({ error: 'No results are currently published.' });
    }

    // Verify this class is part of the published exam
    let isClassInExam = false;
    if (publishedExam.examType === 'INTERNAL_EXAM') {
      isClassInExam = publishedExam.enrollments.some(e => e.classId === classId);
    } else {
      isClassInExam = publishedExam.classId === classId;
    }

    if (!isClassInExam) {
      return res.status(403).json({ error: 'Results for this class are not available in the published exam.' });
    }

    const examId = publishedExam.id;

    // Fetch the same detailed results as Admin ExamResultsPage
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: { students: { orderBy: { rollNumber: 'asc' } } }
    });

    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const subjectConfigs = await prisma.examSubjectConfig.findMany({
      where: { examId, subject: { classId } },
      include: { subject: true },
      orderBy: { subject: { name: 'asc' } }
    });

    const marks = await prisma.mark.findMany({
      where: { examId, student: { classId } }
    });

    res.json({
      exam: {
        id: publishedExam.id,
        name: publishedExam.name,
        publishedAt: publishedExam.publishedAt
      },
      class: cls,
      subjectConfigs,
      marks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
