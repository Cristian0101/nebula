import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback } from "react";

/** Existing project links retain the requested identity, including invalid values. */
export function useProjectNavigate(): ReturnType<typeof useNavigate> {
  const navigate = useNavigate();
  const projectKey = useParams({ strict: false, select: (params) => params.projectKey });
  const checkout = useLocation({ select: (location) => location.search.checkout });
  return useCallback(
    (options: Parameters<typeof navigate>[0]) => {
      const params: unknown = options.params;
      if (
        typeof options.to === "string" &&
        options.to.startsWith("/projects/$projectKey") &&
        params &&
        typeof params === "object" &&
        "projectKey" in params &&
        params.projectKey === projectKey &&
        checkout !== undefined
      ) {
        const search = options.search;
        return navigate({
          ...options,
          search: (previous) => ({
            checkout,
            ...(typeof search === "function"
              ? search(previous)
              : search === true
                ? previous
                : search || {}),
          }),
        } as Parameters<typeof navigate>[0]);
      }
      return navigate(options);
    },
    [checkout, navigate, projectKey],
  ) as typeof navigate;
}
