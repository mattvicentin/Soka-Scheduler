import type { StepOptions, StepOptionsButton, Tour } from "shepherd.js";

export type DashboardTourRole = "professor" | "director" | "dean";

function stepButtons(isFirst: boolean, isLast: boolean): StepOptionsButton[] {
  const out: StepOptionsButton[] = [];
  if (!isFirst) {
    out.push({
      text: "Back",
      secondary: true,
      action() {
        this.back();
      },
    });
  }
  out.push({
    text: isLast ? "Done" : "Next",
    action() {
      if (isLast) {
        this.complete();
      } else {
        this.next();
      }
    },
  });
  return out;
}

function professorSteps(): StepOptions[] {
  const s: StepOptions[] = [
    {
      id: "prof-welcome",
      title: "Welcome, faculty",
      text: "<p>Soka Scheduling helps you propose class times, share room preferences, and submit your schedule to your program.</p><p>This short tour orients you to the faculty workspace—use the <strong>Tutorial</strong> button anytime to replay it.</p>",
      buttons: [
        {
          text: "Next",
          action() {
            this.next();
          },
        },
      ],
    },
    {
      id: "prof-sidebar",
      title: "Your account & navigation",
      text: "<p>The left sidebar shows who you are and your role. Links here switch between your dashboard, calendar, proposal, and fairness views.</p>",
      attachTo: { element: '[data-tour="shell-sidebar"]', on: "right" },
    },
    {
      id: "prof-nav",
      title: "Jump between tools",
      text: "<p>Open <strong>Calendar</strong> to add preferred meeting times on the working draft. <strong>My Proposal</strong> tracks submission status. <strong>Fairness</strong> shows how your load fits program norms.</p>",
      attachTo: { element: '[data-tour="shell-nav"]', on: "right" },
    },
    {
      id: "prof-main",
      title: "Main workspace",
      text: "<p>The center updates with each section—overview charts on the dashboard, the weekly grid on Calendar, forms on My Proposal, and tables on Fairness.</p>",
      attachTo: { element: '[data-tour="shell-main"]', on: "left" },
    },
    {
      id: "prof-calendar-tip",
      title: "Calendar essentials",
      text: "<p>Pick a term, then use <strong>Add slot</strong> for your courses. If there is only a published schedule, the app creates a <strong>working draft</strong> so you can edit safely until the dean publishes updates.</p><p>Set building and room preferences, then submit your proposal when you are ready.</p>",
      attachTo: { element: '[data-tour="shell-main"]', on: "left" },
    },
    {
      id: "prof-tutorial-btn",
      title: "Replay this tour",
      text: "<p>This <strong>Tutorial</strong> control stays in the header so you can walk through the basics again whenever you need.</p>",
      attachTo: { element: '[data-tour="shell-tutorial-btn"]', on: "bottom" },
    },
  ];
  return s.map((step, i) => ({
    ...step,
    buttons: i === 0 ? step.buttons : stepButtons(i === 0, i === s.length - 1),
  })) as StepOptions[];
}

function directorSteps(): StepOptions[] {
  const s: StepOptions[] = [
    {
      id: "dir-welcome",
      title: "Welcome, program director",
      text: "<p>Use this app to review program calendars, approve faculty proposals, and monitor fairness across your program.</p>",
      buttons: [
        {
          text: "Next",
          action() {
            this.next();
          },
        },
      ],
    },
    {
      id: "dir-sidebar",
      title: "Program context",
      text: "<p>The sidebar lists your account and role. Every page you open stays scoped to the programs you direct.</p>",
      attachTo: { element: '[data-tour="shell-sidebar"]', on: "right" },
    },
    {
      id: "dir-nav",
      title: "Where to work",
      text: "<p><strong>Dashboard</strong> summarizes status. <strong>Calendar</strong> shows and edits draft slots for your program (and can create a working draft when needed).</p><p><strong>Pending Approvals</strong> is where you review submitted schedules. <strong>Fairness</strong> highlights load balance.</p>",
      attachTo: { element: '[data-tour="shell-nav"]', on: "right" },
    },
    {
      id: "dir-main",
      title: "Detail pane",
      text: "<p>Facts, grids, and approval queues fill this area depending on the sidebar link you chose.</p>",
      attachTo: { element: '[data-tour="shell-main"]', on: "left" },
    },
    {
      id: "dir-tutorial-btn",
      title: "Tutorial on demand",
      text: "<p>You can restart this walkthrough from <strong>Tutorial</strong> in the header at any time.</p>",
      attachTo: { element: '[data-tour="shell-tutorial-btn"]', on: "bottom" },
    },
  ];
  return s.map((step, i) => ({
    ...step,
    buttons: i === 0 ? step.buttons : stepButtons(i === 0, i === s.length - 1),
  })) as StepOptions[];
}

function deanSteps(): StepOptions[] {
  const s: StepOptions[] = [
    {
      id: "dean-welcome",
      title: "Welcome, dean",
      text: "<p>These tools support college-wide scheduling: faculty records, offerings, drafts and published schedules, proposals, accounts, and invitations.</p>",
      buttons: [
        {
          text: "Next",
          action() {
            this.next();
          },
        },
      ],
    },
    {
      id: "dean-sidebar",
      title: "Dean navigation",
      text: "<p>The sidebar groups <strong>Faculty</strong>, <strong>Sabbaticals</strong>, and <strong>Courses</strong> for roster work; <strong>Calendar</strong> and <strong>Proposals</strong> for the schedule cycle; and <strong>Accounts</strong>, <strong>Invitations</strong>, and <strong>Settings</strong> for access and configuration.</p>",
      attachTo: { element: '[data-tour="shell-sidebar"]', on: "right" },
    },
    {
      id: "dean-nav",
      title: "Deep sections",
      text: "<p>Use <strong>Faculty</strong> and <strong>Courses</strong> to keep templates and offerings accurate. <strong>Calendar</strong> manages draft and official versions. <strong>Proposals</strong> tracks the approval pipeline from programs.</p>",
      attachTo: { element: '[data-tour="shell-nav"]', on: "right" },
    },
    {
      id: "dean-main",
      title: "Workspace",
      text: "<p>Tables, calendars, and forms render here. Export options and publish actions appear on the relevant screens.</p>",
      attachTo: { element: '[data-tour="shell-main"]', on: "left" },
    },
    {
      id: "dean-tutorial-btn",
      title: "Help anytime",
      text: "<p>Replay this overview from <strong>Tutorial</strong> whenever you onboard someone new or need a refresher.</p>",
      attachTo: { element: '[data-tour="shell-tutorial-btn"]', on: "bottom" },
    },
  ];
  return s.map((step, i) => ({
    ...step,
    buttons: i === 0 ? step.buttons : stepButtons(i === 0, i === s.length - 1),
  })) as StepOptions[];
}

function stepsForRole(role: DashboardTourRole): StepOptions[] {
  if (role === "director") return directorSteps();
  if (role === "dean") return deanSteps();
  return professorSteps();
}

export function createDashboardTour(
  Shepherd: typeof import("shepherd.js").default,
  role: DashboardTourRole,
  onSettled: () => void
): Tour {
  const tour = new Shepherd.Tour({
    defaultStepOptions: {
      cancelIcon: {
        enabled: true,
      },
      scrollTo: {
        behavior: "smooth",
        block: "center",
      },
      classes: "soka-shepherd-step",
      modalOverlayOpeningPadding: 6,
    },
    useModalOverlay: true,
  });

  let settled = false;
  const settleOnce = () => {
    if (settled) return;
    settled = true;
    onSettled();
  };

  tour.on("cancel", settleOnce);
  tour.on("complete", settleOnce);

  for (const step of stepsForRole(role)) {
    tour.addStep(step);
  }

  return tour;
}
