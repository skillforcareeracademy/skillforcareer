import Image from "next/image";

interface PlacedStudent {
  name: string;
  course: string;
  photo: string;
}

/**
 * Learners shown in the "1000+ Students Got Placed" marquee, mirroring the
 * client's existing site (skillforcareer.in). Photos are the learners' own —
 * pulled from the live site and served locally from /public/images/students.
 */
const ROW_ONE: PlacedStudent[] = [
  { name: "Himani", course: "Data Analyst", photo: "/images/students/student-11.png" },
  { name: "Sneha Yadav", course: "Web Development", photo: "/images/students/student-14.png" },
  { name: "Anjali Rajput", course: "Digital Marketing", photo: "/images/students/student-15.png" },
  { name: "Ajeet", course: "Retail & Sales", photo: "/images/students/student-16.png" },
  { name: "Priya Singh", course: "Full Stack Developer", photo: "/images/students/student-19.png" },
  { name: "Anu Chauhan", course: "Social Media Management", photo: "/images/students/student-20.png" },
  { name: "Bhumika Gandhi", course: "Digital Marketing", photo: "/images/students/student-6.png" },
];

const ROW_TWO: PlacedStudent[] = [
  { name: "Neha Sharma", course: "Full Stack Developer", photo: "/images/students/student-1.png" },
  { name: "Raunak Bhatia", course: "Web Development", photo: "/images/students/student-4.png" },
  { name: "Ritika Verma", course: "Data Analyst", photo: "/images/students/student-5.png" },
  { name: "Bhumika Gandhi", course: "Digital Marketing", photo: "/images/students/student-6.png" },
  { name: "Sneha Yadav", course: "Web Development", photo: "/images/students/student-14.png" },
];

/**
 * The animation translates the track by -50%, so the two halves must be
 * identical for the loop to be seamless — and each half has to be wider than
 * the viewport or a gap opens at the seam. A card is 170px including its
 * margin, so 24 of them cover 4080px: enough for a full-bleed 4K display.
 */
const CARDS_PER_HALF = 24;

function buildTrack(students: PlacedStudent[]): PlacedStudent[] {
  const half: PlacedStudent[] = [];
  while (half.length < CARDS_PER_HALF) half.push(...students);
  return [...half, ...half];
}

function StudentCard({ student }: { student: PlacedStudent }) {
  return (
    <div className="mr-5 h-[160px] w-[130px] shrink-0 overflow-hidden rounded-xl bg-white text-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] sm:h-[185px] sm:w-[150px]">
      {/* Eager: the cards move by CSS transform, and the lazy-load observer
          misses them — cards scrolled in blank. Only 10 distinct files back
          the whole marquee, so the browser serves the repeats from cache. */}
      <Image
        src={student.photo}
        alt={`${student.name}, ${student.course} learner at SkillForCareer`}
        width={150}
        height={139}
        loading="eager"
        className="h-[120px] w-full object-cover object-top sm:h-[139px]"
      />
      <p className="mt-0.5 truncate px-1 text-sm font-bold text-black">
        {student.name}
      </p>
      <p className="truncate px-1 text-[11px] text-neutral-700">{student.course}</p>
    </div>
  );
}

function MarqueeRow({
  students,
  reverse,
}: {
  students: PlacedStudent[];
  reverse?: boolean;
}) {
  // Padding, not margin: overflow-hidden clips vertically too, and the cards'
  // drop shadow (0 4px 12px) reaches 16px past the card box — with a margin the
  // row is exactly card-height and shears the shadow off flat.
  return (
    <div className="marquee-row flex overflow-hidden py-4">
      <div className={`marquee-track ${reverse ? "marquee-track-reverse" : ""}`}>
        {buildTrack(students).map((student, i) => (
          <StudentCard key={`${student.name}-${i}`} student={student} />
        ))}
      </div>
    </div>
  );
}

export function PlacedStudents() {
  return (
    <section className="bg-[#f3f7fd] py-14 sm:py-16 dark:bg-neutral-900">
      <div className="container-page mb-10 text-center sm:mb-12">
        <p className="text-foreground text-lg sm:text-xl">Skill For Career</p>
        <h2 className="mt-4 text-3xl font-bold sm:text-5xl">
          1000+{" "}
          <span className="relative inline-block">
            <span className="relative z-10">Students</span>
            <span
              aria-hidden
              className="bg-primary/25 absolute inset-x-0 bottom-0.5 z-0 h-2 rounded-full"
            />
          </span>{" "}
          Got Placed
        </h2>
      </div>

      {/* Full-bleed on purpose: an infinite marquee should run the whole width
          of the screen, not stop at the page container's gutters. */}
      <div
        className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]"
        aria-label="Learners placed after training at SkillForCareer"
      >
        <MarqueeRow students={ROW_ONE} />
        <MarqueeRow students={ROW_TWO} reverse />
      </div>
    </section>
  );
}
