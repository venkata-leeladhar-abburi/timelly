"use client";

import { render, screen, waitFor } from "@testing-library/react";
import RequireRole from "@/app/_components/auth/RequiredRoles";

const mockReplace = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const useSession = require("next-auth/react").useSession;

describe("RequireRole", () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it("shows Loading when status is loading", () => {
    useSession.mockReturnValue({ data: null, status: "loading" });
    render(
      <RequireRole allowedRoles={["SCHOOLADMIN"]}>
        <span>Protected</span>
      </RequireRole>
    );
    expect(screen.getByText("Verifying Access")).toBeInTheDocument();
    expect(screen.queryByText("Protected")).not.toBeInTheDocument();
  });

  it("renders children when user has allowed role", () => {
    useSession.mockReturnValue({
      data: { user: { role: "SCHOOLADMIN" } },
      status: "authenticated",
    });
    render(
      <RequireRole allowedRoles={["SCHOOLADMIN", "TEACHER"]}>
        <span>Protected</span>
      </RequireRole>
    );
    expect(screen.getByText("Protected")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not redirect when role is missing (hydration safe)", () => {
    useSession.mockReturnValue({ data: { user: {} }, status: "authenticated" });
    render(
      <RequireRole allowedRoles={["SCHOOLADMIN"]}>
        <span>Protected</span>
      </RequireRole>
    );
    expect(mockReplace).not.toHaveBeenCalledWith("/unauthorized");
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });

  it("redirects to unauthorized when role not in allowedRoles", () => {
    useSession.mockReturnValue({
      data: { user: { role: "STUDENT" } },
      status: "authenticated",
    });
    render(
      <RequireRole allowedRoles={["SCHOOLADMIN", "TEACHER"]}>
        <span>Protected</span>
      </RequireRole>
    );
    return waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/unauthorized"));
  });
});
