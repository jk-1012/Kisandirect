interface StepProgressProps {
  activeStep: number;
}

export default function StepProgress({ activeStep }: StepProgressProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={`h-2.5 flex-1 rounded-full transition-colors ${
            index <= activeStep ? 'bg-emerald-600' : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}
