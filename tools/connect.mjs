import { adminGraphql } from '../lib/graphql.mjs';
import { requireConfirm } from '../lib/denied-ops.mjs';

export const connectTools = [
  {
    name: 'list_meeting_types',
    description: 'List Lesuto Connect meeting types for this channel.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(`query ListMeetingTypes { schedulingMeetingTypes { id slug name durationMinutes isActive color location } }`),
  },
  {
    name: 'create_booking_invite',
    description: 'Create a Lesuto Connect invite link. Requires a Connect or All jobs key. Pass guestEmail only when the merchant asked to email the guest.',
    inputSchema: {
      type: 'object',
      properties: {
        meetingTypeId: { type: 'string' },
        guestName: { type: 'string' },
        guestEmail: { type: 'string' },
        sendEmail: { type: 'boolean' },
        adminNote: { type: 'string' },
        expiresInHours: { type: 'number' },
      },
      required: ['meetingTypeId'],
    },
    execute: (args) => adminGraphql(
      `mutation CreateBookingInvite($i: CreateBookingInviteInput!) { createBookingInvite(input: $i) { id token bookingUrl guestName guestEmail status emailSent } }`,
      {
        i: {
          meetingTypeId: args.meetingTypeId,
          guestName: args.guestName || null,
          guestEmail: args.guestEmail || null,
          sendEmail: Boolean(args.sendEmail),
          adminNote: args.adminNote || null,
          expiresInHours: args.expiresInHours || null,
        },
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'list_upcoming_bookings',
    description: 'List upcoming Lesuto Connect bookings.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number' }, scope: { type: 'string' } },
    },
    execute: (args) => adminGraphql(
      `query ListUpcoming($l: Int, $scope: String) { schedulingUpcomingBookings(limit: $l, scope: $scope) { id meetingTypeId startTime endTime guestName guestEmail status googleMeetUrl meetingUrl } }`,
      { l: args.limit || 20, scope: args.scope || 'mine' },
    ),
  },
  {
    name: 'cancel_booking',
    description: 'Cancel a Lesuto Connect booking. Requires a Connect or All jobs key. Destructive: requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, reason: { type: 'string' }, confirm: { type: 'boolean' } },
      required: ['id'],
    },
    execute: (args) => {
      requireConfirm(args, 'booking cancel');
      return adminGraphql(
        `mutation CancelBooking($id: ID!, $r: String) { cancelBooking(id: $id, reason: $r) { id status } }`,
        { id: args.id, r: args.reason || null },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'complete_booking',
    description: 'Mark a Lesuto Connect booking completed. Requires a Connect or All jobs key. Destructive: requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, confirm: { type: 'boolean' } },
      required: ['id'],
    },
    execute: (args) => {
      requireConfirm(args, 'booking complete');
      return adminGraphql(
        `mutation CompleteBooking($id: ID!) { markBookingCompleted(id: $id) { id status } }`,
        { id: args.id },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'no_show_booking',
    description: 'Mark a Lesuto Connect booking as no-show. Requires a Connect or All jobs key. Destructive: requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, confirm: { type: 'boolean' } },
      required: ['id'],
    },
    execute: (args) => {
      requireConfirm(args, 'no-show');
      return adminGraphql(
        `mutation NoShowBooking($id: ID!) { markBookingNoShow(id: $id) { id status } }`,
        { id: args.id },
        { allowWrite: true },
      );
    },
  },
];
