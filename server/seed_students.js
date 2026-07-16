/**
 * MATHA ENGLISH MEDIUM SCHOOL
 * Student Seed Script — Academic Year 2026-27
 * 
 * HOW TO USE:
 * 1. Copy this file into your project's server/ folder
 * 2. Make sure your .env has DATABASE_URL set correctly
 * 3. Run: node seed_students.js
 * 
 * This script will:
 * - Create classes (Class 1A, 2A, 3A, 3B, 4, 5, 6, 7, 8, 9, 10)
 *   IF they don't already exist (safe to re-run)
 * - Add all students to their correct class in exact order
 * - Skip any student that already exists (no duplicates)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const classesData = [
  {
    name: 'Class 1A',
    students: [
      'A.Gnana nagavi',
      'Birudugadda. Arpitha',
      'Bokka. Nikshitha Sai',
      'Chelluboina. Jessika',
      'Kandru.Aaradhya',
      'Kona. Renuka',
      'Kokkeragadda. Akshitha',
      'M.Pranathi deevena',
      'Motepalli. Shalini',
      'Puchakayala.Honey Kumari',
      'Shaik. Raafia',
      'T.Ritika',
      'Tunduri. Vaishnavi',
      'Yadla. Rishitha Priya',
      'Beiy. Ayaz',
      'Bokka. Manvik Karthik',
      'Ch. Aditya Krishna',
      'Chori. Kevin prem',
      'Duba. Dhanvin Surya',
      'Dasari. Yaswardhan raju',
      'Mali. Hithesh',
      'Mohammad. Inthiyaz',
      'Maganti. Reyansh',
      'Mali. Dashrath',
      'P.Yaksha sai surya',
      'Rajveer Sharma',
      'Thaddi. Thaneesh Kumar',
      'Valluri. Girivardhan',
      'T. NIEUPAM',
    ],
  },
  {
    name: 'Class 2A',
    students: [
      'Sk. Afsheen',
      'B. Linikshitha',
      'Ch. Janani',
      'Dasari Sthuthi Mahima',
      'D. Lasya',
      'J.Likhitha',
      'M. Supritha Sri',
      'P.Nithya Krupa',
      'R.Jishitha singh',
      'S. Josmika',
      'T. Hari Sai Anupama',
      'T. Jeevana Akshaya',
      'Y. Hema Chandrika',
      'Allada. Pragnesh ram',
      'Bale. Siva ram',
      'B.Ayaan',
      'Boppana. Harsha',
      'Ch. Naga Nihanth',
      'D.Harsha Vardhan Raju',
      'Kalavakollu. Ram sai',
      'K. Hemanth Kumar',
      'K. Nitya Jeevan',
      'K. Veekshith',
      'K.L.S. Praveen',
      'K.Karthikeya',
      'Mungara. Chetan Sai',
      'Maganti. Subhash',
      'Moru .Harshavardhan',
      'M.Nandha Kishore',
      'Poluboyina. Darshith',
      'P. Gnana Satya Kowshik',
      'Pydimarri Kruthik',
      'Sk. Riyan basha',
      'SK.Rayyan',
      'Sk. Thanviruddin',
      'Tadivaka. Hananya',
      'Thammisetti. Yaswanth',
      'T.Manikanta Swamy',
    ],
  },
  {
    name: 'Class 3A',
    students: [
      'B. Prasastha',
      'G.Lakshmi Aishwarya',
      'J.Lakshmi Durga',
      'K. Joshitha',
      'N. Nava kedeshini',
      'P. Chaitra Siva Lakshmi',
      'S. Shanmukha Priya',
      'V. Gnana sri Radha',
      'A.Gopal manikanta baji',
      'B. Charan raj',
      'J.Sherwin Sandy',
      'K.Navaneeth Siva Kumar',
      'K. Ram sai',
      'K.Varun Kumar',
      'K. Yuvan',
      'k. sathwik',
      'M. Aditya',
      'G. Gavin mokshagna',
      'M. Navanandhan',
      'N. Lalith Kumar',
      'P.Abhishek',
      'P. Nikhilesh',
      'T. Navaneeth',
      'T. Vihal',
    ],
  },
  {
    name: 'Class 3B',
    students: [
      'B. Manjusha',
      'Md. Mahiya tazmin',
      'P. Dipanshi',
      'P. Meghana',
      'P. Yokshsitha',
      'S. Ruchika Suthar',
      'T. Gnana Iswarya',
      'T. Tejakshi',
      'T. Leela sri',
      'A.Anand paul',
      'B.Aryaksh',
      'B.Siva ram',
      'B. Abhay Kumar',
      'B. Nanda Kishore',
      'Ch. Naga ram Satya',
      'K. Vedhanth',
      'K. Arun babu',
      'M. Gnana charith',
      'M. Issac Akshay',
      'Simhadri. Purvansh',
      'T.Avinash',
      'V.Deepak Siva Sai ganesh',
      'Krishna Sharma',
    ],
  },
  {
    name: 'Class 4',
    students: [
      'Chennamsetti. Teja Sri',
      'Erlapati.Dhanyatha',
      'I.Manogna',
      'Marrapu. Chandrika Sri',
      'Muntha. Ujjwala Sri',
      'Pepeti.Chinmai',
      'Puchakayala. Gracy',
      'R.Mokshitha',
      'S. Mohana Satya Priya',
      'Valluri. Raja Sri',
      'B.Sagar',
      'Ch. Ravindra',
      'G. Naga yogith Sai',
      'G. Jesil riyaan',
      'G.Sathwik',
      'Srujan kumar',
      'Kandru. Gabriyelu',
      'Kona. Saketh',
      'K. Karthikeya',
      'Mali. Nikhil Kumar',
      'M. Sai Manikanta',
      'M.Saharsh',
      'Mungara. Charan Tej',
      'P.Ram Charan',
      'Potla. Sanjay Prakash',
      'P. Gautam Krishna',
      'S.Bala satya sai',
      'Sk. Zaid',
      'SK.Nasim Zaidi Shah',
      'Tadivaka. Chaitanya',
      'Thaddi. Rithikeswar',
      'T. Rithwak',
      'V.Chaithanya',
      'V.Santosh varma',
    ],
  },
  {
    name: 'Class 5',
    students: [
      'Abdul.Sumayya',
      'CH.Hema sri',
      'Chori. Vasavi',
      'Dasari. Yerusha',
      'J.Y. Sri Satya Keerthi',
      'Kandru. Ananya',
      'Maddala. Jaya Sri',
      'Mali. Sapna kumari',
      'M. Ayesha siddika',
      'Mucharla. Tejaswini',
      'M. Alekhya Lakshmi',
      'Nune. Manasvini',
      'P. Karthika sri Tulasi',
      'Pedavula. Eeshitha',
      'Simhadri. Saanvi',
      'Thammisetti. Meenakshi',
      'Abdul. Yasin faiz',
      'A. Bhuvaneswar naga',
      'Burla. Nagendra phani',
      'Gorripatti. Rishikesh',
      'G. Sugnan Kumar',
      'K. Venkata Sai ram',
      'K. Gowtham Raju',
      'Kolati.jonah',
      'Mucharala .Dinesh babu',
      'N. Venkata naga Varma',
      'Nunna. Gowtham Sai',
      'Parasa. Hemanth',
      'P. Varun Chaitanya',
      'Pelluri. Venkata sagar',
      'Pepeti. Mohan',
      'S.Tarun sai',
      'Talari. Abhilash',
      'Valluri. Devansh',
      'Velpuri .Jaya krishna',
      'Parasa.Mohan chand',
    ],
  },
  {
    name: 'Class 6',
    students: [
      'Boppana Gnana Sri syamala',
      'Boppana. Jyothsna Sri',
      'Ch. Gopika',
      'Chori. Saanvi',
      'Katari. Sri Varshini',
      'Kona. Manasvi',
      'Sayyad. Arshiya',
      'Katari.Sena Sai',
      'Kona. Yoga Sri',
      'Lakkareddy. Hadassah',
      'Majjada. Dhanya grace',
      'Moru. Harshini',
      'Mungara suma',
      'N. Lakshitha',
      'Nune. Lasya Sri',
      'Pinninti. Jahnavi',
      'Thammisetti. Nandini',
      'Kaniganti. Yadidya',
      'Talari. Baladitya',
      'Mahanandha. Bala Prakash',
      'Thammisetti. Dileep',
      'B. Devanandhan',
      'Abothula. Ganesh',
      'Thota. Giri Charan',
      'V. Geetha Akshay',
      'Katta. Mohan Sai',
      'Gudivada. Naga Sai Karthik',
      'Thota. Naga Sai Sandeep',
      'P. Vijay Sekhar',
      'Thota. Varun sathwik',
      'Jonnada. Bhavani prasad',
      'S. Aadi seshu',
      'B.Yonosh babu',
      'G.Nishanc',
      'G.Praneeth',
      'K.Nokshith',
      'M.dhanush',
      'M.Balaram',
      'S.Sanvin',
      'T.Baladitya',
      'B.Joyal',
    ],
  },
  {
    name: 'Class 7',
    students: [
      'A.Chaitra Priya',
      'Abdul Farheen Begum',
      'Gantasala. Geethika rani',
      'Nunna. Harsha Sri',
      'Katari. Hima hasini',
      'Marrapu. Lahari sri',
      'Pepeti. Lakshmi Durga',
      'Chadhalavada. Manju Sri',
      'Velpuri. Moksha Sai Sri',
      'Thokkudubiyyapu. Moulya',
      'Shaik. Saira',
      'Muthyala. Sathwika',
      'Burla. Vinaya',
      'Shaik. Zafira',
      'Manne. Rajeswari',
      'T. Chandu',
      'Arava Gagan Karthikeya',
      'Jada.Deekshith Nandhan',
      'Gantasala. Gnana Varma',
      'Sannamandla. Harsha Vardhan',
      'Kolati. Joel',
      'Namburi. Pavan Varma',
      'Inti.Prem Kumar',
      'Nirmal Raj purohit',
      'Parasa. Ravi Teja',
      'Gujjula. Sanjay',
      'Pasam. Hema Giri Satya Narendra',
      'R. Shanmukha Kumar',
      'K. Shanmukha Sai',
      'P. Sushanth',
      'Battula. Bhargav',
      'P.Jai deep',
    ],
  },
  {
    name: 'Class 8',
    students: [
      'Yalamakurthi. Amulya',
      'Namburi. Bindhu Sri',
      'Lakkareddy. Catherin',
      'Valluri. Dhana Sri',
      'Manne. Keerthana',
      'Marella. Pujitha',
      'Majjada. Ropheka grace',
      'Allamsetti. Sravani',
      'Ulisi. Sravya',
      'Vegesena. Nandhitha varma',
      'Shaik. Sumayya afroze',
      'Nunna. Tejaswini',
      'Thammisetti. Tejaswini',
      'Chimata. Thirdha Sri',
      'Mahananda. Vishnu Priya',
      'Vasundhara Raj Purohith',
      'Jami. Harshitha Sri Durga',
      'P. Varshini',
      'Nune. Dhanaswini',
      'Talari.Jaya Sri',
      'Mallipudi. Keerthi',
      'T. Ramanjali',
      'G.Karthika Varshini',
      'N.Sai jyothika',
      'Gorla. Akhilesh',
      'Sayyed. Asif',
      'Busanaboyina. Bala Aditya',
      'Jada. Deekshith pardhu',
      'Nune. Deepak Sai',
      'Gudivada. Dharsh naga Sai',
      'Busanaboyina.Janaki kodhanda ram',
      'Kona. Jayaditya',
      'Munagala. Kodanda Chaitanya',
      'Boppana. Navadeep',
      'Katuri. Raghava',
      'Mali. Sanjay kumar',
      'Chennam chetti. Tulasi Padma Sainath',
      'P. Vikas',
      'P. Yashwanth naga Venkata venai sai',
      'Indukuri.Rama Krishna raju',
      'Pardha saradhi',
    ],
  },
  {
    name: 'Class 9',
    students: [
      'Kunche. Archana',
      'Guttikonda. Deekshitha',
      'Pydimarri.T. Dhana Lakshmi',
      'Manne. Lakshmi Prasanna',
      'Pinninti. Mounica',
      'Veeragani. Pravallika',
      'Agollu.Pushyami devi',
      'Potla. Suhani',
      'Pydimarri. Sai Venkata thanmai',
      'Bodipogu. Suneela Sri',
      'Nunna. Greeshma Sri',
      'Parasa. Anand Kumar',
      'Kondu Boina . Baji Siva',
      'Kunchela. Krishna babu',
      'Busanaboyina. Kishore',
      'Tunduri. Puri Sri Jagannadh',
      'Balla. sai Sampath',
      'Dakarapu. Suhas',
      'Manne. Teja Venkata Sri Sai',
      'N. Venkata Kishore',
      'Abdul .Fareed baig',
      'P.Vikas',
      'P.Akhil',
      'S.N.V.Chaitanya',
      'CH.Hemanth Kumar',
      'Jalli.Denwin Sandy',
    ],
  },
  {
    name: 'Class 10',
    students: [
      'Kotla. Bala Bhavya Sri',
      'Grandhi. Bhavigna',
      'P. Harini',
      'Nalam. Lalitha Priya',
      'P. Moksha vyshnavi',
      'M. Pavani naga Pallavi',
      'Guttikonda. Poojitha',
      'Chennamsetti. Sreeja',
      'Manne. Teja Sri durga',
      'Mohammad. Vasifa',
      'M. Durga sai Charan',
      'M. Dwarakehswar',
      'Putti. Govinda Bhaskar',
      'Balla. Hari Sai Sandeep',
      'B. Harsha Vardhan',
      'Katuri. Harsha Vardhan',
      'M. Hemanth Sai',
      'A.Lakshmi Narasimha s',
      'Rajpurohit Dharmendra',
      'Tati. Surya Teja',
      'Burla. Veeraiah',
      'Battula. Harsha Vardhan',
      'Gattamaneni. Prasangi',
      'Kota Naga Dhanush',
    ],
  },
];

async function main() {
  console.log('🚀 Starting student seed for Matha English Medium School...\\n');

  let totalClassesCreated = 0;
  let totalStudentsCreated = 0;
  let totalSkipped = 0;

  for (const classData of classesData) {
    // Find or create the class
    let cls = await prisma.class.findFirst({
      where: { name: classData.name },
    });

    if (!cls) {
      cls = await prisma.class.create({
        data: { name: classData.name },
      });
      totalClassesCreated++;
      console.log(`✅ Created class: ${classData.name}`);
    } else {
      console.log(`⏭️  Class already exists: ${classData.name}`);
    }

    // Add students to the class in exact order
    let rollNumber = 1;
    for (const studentName of classData.students) {
      const existingStudent = await prisma.student.findFirst({
        where: {
          name: studentName,
          classId: cls.id,
        },
      });

      if (!existingStudent) {
        await prisma.student.create({
          data: {
            name: studentName,
            rollNumber: String(rollNumber).padStart(3, '0'),
            classId: cls.id,
          },
        });
        totalStudentsCreated++;
      } else {
        totalSkipped++;
      }

      rollNumber++;
    }

    console.log(
      `   → ${classData.students.length} students processed for ${classData.name}`
    );
  }

  console.log('\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Seed complete!');
  console.log(`   Classes created: ${totalClassesCreated}`);
  console.log(`   Students added:  ${totalStudentsCreated}`);
  console.log(`   Already existed (skipped): ${totalSkipped}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
