type Person = { initial: string };

export default function AttendeesRow({ people }: { people: Person[] }) {
  return (
    <div className="mt-2 flex gap-2">
      {people.map((p, i) => (
        <div key={i} className="h-6 w-6 rounded-full bg-brand-teal/10 grid place-items-center">
          <span className="text-xs font-semibold text-brand-teal">{p.initial}</span>
        </div>
      ))}
    </div>
  );
}
