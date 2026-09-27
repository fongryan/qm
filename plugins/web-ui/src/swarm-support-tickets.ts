/** Invented ticket labels for the local demo. Never derived from private QM content. */
const demoCustomers = ["Maya R.", "Jonah K.", "Priya S.", "Elliot T.", "Nina L.", "Owen C.", "Amara D.", "Leo V."];
const subjects = ["Refund request after duplicate charge", "Shipment is running late", "Invoice amount looks wrong", "Escalation on an open case"];
export interface DemoTicket {number:number;customer:string;subject:string;status:"Waiting on review"|"Draft ready"|"In progress"}
export function demoTicket(number:number, drafted:number, dispatched:number): DemoTicket {
  if (!Number.isInteger(number) || number < 1 || number > 24) throw new RangeError("demo ticket out of range");
  return {number, customer:demoCustomers[(number-1)%demoCustomers.length]!, subject:subjects[(number-1)%subjects.length]!,
    status:number <= drafted ? (number === 1 ? "Waiting on review" : "Draft ready") : number <= dispatched ? "In progress" : "In progress"};
}
