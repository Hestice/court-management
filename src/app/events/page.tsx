import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Events" };

type Event = {
  title: string;
  date: string;
  description: string;
  registrationUrl?: string;
};

const EVENTS: Event[] = [
  {
    title: "Spring Open Doubles Tournament",
    date: "May 18, 2026",
    description:
      "Single-day double-elimination tournament. Open to all skill levels. Prizes for top three teams.",
    registrationUrl: "mailto:events@yourcourt.com?subject=Spring%20Open",
  },
  {
    title: "Thursday Night Open Play",
    date: "Every Thursday · 7:00–10:00 PM",
    description:
      "Casual drop-in open play for intermediate players. No registration required — first come, first served.",
  },
  {
    title: "Beginner Clinic with Coach Rica",
    date: "May 25, 2026",
    description:
      "Two-hour introductory clinic covering grips, serves, and basic rally play. Paddles provided.",
    registrationUrl: "mailto:events@yourcourt.com?subject=Beginner%20Clinic",
  },
];

export default function EventsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Events
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upcoming tournaments, clinics, and open-play sessions.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {EVENTS.map((event) => (
          <Card key={event.title}>
            <CardHeader>
              <CardTitle>{event.title}</CardTitle>
              <CardDescription>{event.date}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{event.description}</p>
              {event.registrationUrl ? (
                <a
                  href={event.registrationUrl}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Register →
                </a>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
