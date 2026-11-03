"use client";

import { useParams } from "next/navigation";
import { TripView } from "@/components/trip/trip-view";

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  return <TripView key={id} tripId={id} />;
}
