"use client";

import Pagination from "@/components/ui/Pagination";

type Props = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
};

/** Thin alias kept for existing import sites — see components/ui/Pagination. */
export default function InlinePagination(props: Props) {
  return <Pagination {...props} />;
}
