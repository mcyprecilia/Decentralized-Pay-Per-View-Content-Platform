 
import { describe, it, expect, beforeEach } from "vitest";
import { buffCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_CONTENT_ID = 101;
const ERR_INVALID_DURATION = 102;
const ERR_INVALID_AMOUNT = 103;
const ERR_PAYMENT_ALREADY_EXISTS = 104;
const ERR_PAYMENT_NOT_FOUND = 105;
const ERR_INSUFFICIENT_BALANCE = 106;
const ERR_INVALID_TIMESTAMP = 107;
const ERR_AUTHORITY_NOT_VERIFIED = 108;
const ERR_INVALID_PAYMENT_STATUS = 109;
const ERR_INVALID_CONSUMER = 110;
const ERR_INVALID_CREATOR = 111;
const ERR_PAYMENT_EXPIRED = 112;
const ERR_INVALID_FEE_RATE = 113;
const ERR_MAX_PAYMENTS_EXCEEDED = 114;
const ERR_INVALID_CURRENCY = 115;
const ERR_INVALID_REFUND_AMOUNT = 116;
const ERR_REFUND_NOT_ALLOWED = 117;
const ERR_INVALID_ACCESS_TOKEN = 118;
const ERR_INVALID_SIGNATURE = 119;
const ERR_INVALID_PUBLIC_KEY = 120;

interface Payment {
	contentId: Uint8Array;
	consumer: string;
	amount: number;
	timestamp: number;
	duration: number;
	status: string;
	creator: string;
	feeAmount: number;
	netAmount: number;
	refundAmount: number;
	accessToken: Uint8Array;
	signature: Uint8Array;
	publicKey: Uint8Array;
}

interface Result<T> {
	ok: boolean;
	value: T;
}

class PaymentProcessorMock {
	state: {
		nextPaymentId: number;
		maxPayments: number;
		platformFeeRate: number;
		authorityContract: string | null;
		totalPaymentsProcessed: number;
		totalFeesCollected: number;
		refundWindow: number;
		minPaymentAmount: number;
		maxPaymentAmount: number;
		supportedCurrency: string;
		payments: Map<number, Payment>;
		paymentsByContent: Map<string, number[]>;
		paymentStatuses: Map<number, boolean>;
	} = {
		nextPaymentId: 0,
		maxPayments: 10000,
		platformFeeRate: 5,
		authorityContract: null,
		totalPaymentsProcessed: 0,
		totalFeesCollected: 0,
		refundWindow: 144,
		minPaymentAmount: 10,
		maxPaymentAmount: 1000000,
		supportedCurrency: "STX",
		payments: new Map(),
		paymentsByContent: new Map(),
		paymentStatuses: new Map(),
	};
	blockHeight: number = 0;
	caller: string = "ST1TEST";
	stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

	constructor() {
		this.reset();
	}

	reset() {
		this.state = {
			nextPaymentId: 0,
			maxPayments: 10000,
			platformFeeRate: 5,
			authorityContract: null,
			totalPaymentsProcessed: 0,
			totalFeesCollected: 0,
			refundWindow: 144,
			minPaymentAmount: 10,
			maxPaymentAmount: 1000000,
			supportedCurrency: "STX",
			payments: new Map(),
			paymentsByContent: new Map(),
			paymentStatuses: new Map(),
		};
		this.blockHeight = 0;
		this.caller = "ST1TEST";
		this.stxTransfers = [];
	}

	setAuthorityContract(contractPrincipal: string): Result<boolean> {
		if (this.state.authorityContract !== null) {
			return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
		}
		this.state.authorityContract = contractPrincipal;
		return { ok: true, value: true };
	}

	setPlatformFeeRate(newRate: number): Result<boolean> {
		if (newRate > 10) return { ok: false, value: ERR_INVALID_FEE_RATE };
		if (!this.state.authorityContract)
			return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
		this.state.platformFeeRate = newRate;
		return { ok: true, value: true };
	}

	setMinPaymentAmount(newMin: number): Result<boolean> {
		if (newMin <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
		if (!this.state.authorityContract)
			return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
		this.state.minPaymentAmount = newMin;
		return { ok: true, value: true };
	}

	setMaxPaymentAmount(newMax: number): Result<boolean> {
		if (newMax <= this.state.minPaymentAmount)
			return { ok: false, value: ERR_INVALID_AMOUNT };
		if (!this.state.authorityContract)
			return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
		this.state.maxPaymentAmount = newMax;
		return { ok: true, value: true };
	}

	setRefundWindow(newWindow: number): Result<boolean> {
		if (newWindow <= 0) return { ok: false, value: ERR_INVALID_DURATION };
		if (!this.state.authorityContract)
			return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
		this.state.refundWindow = newWindow;
		return { ok: true, value: true };
	}

	payForContent(
		contentId: Uint8Array,
		duration: number,
		amount: number,
		creator: string,
		accessToken: Uint8Array,
		signature: Uint8Array,
		publicKey: Uint8Array
	): Result<number> {
		if (this.state.nextPaymentId >= this.state.maxPayments)
			return { ok: false, value: ERR_MAX_PAYMENTS_EXCEEDED };
		if (contentId.length !== 32)
			return { ok: false, value: ERR_INVALID_CONTENT_ID };
		if (duration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
		if (
			amount < this.state.minPaymentAmount ||
			amount > this.state.maxPaymentAmount
		)
			return { ok: false, value: ERR_INVALID_AMOUNT };
		if (this.caller === "SP000000000000000000002Q6VF78")
			return { ok: false, value: ERR_INVALID_CONSUMER };
		if (accessToken.length !== 64)
			return { ok: false, value: ERR_INVALID_ACCESS_TOKEN };
		if (signature.length !== 65)
			return { ok: false, value: ERR_INVALID_SIGNATURE };
		if (publicKey.length !== 33)
			return { ok: false, value: ERR_INVALID_PUBLIC_KEY };
		if (!this.state.authorityContract)
			return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

		const feeAmount = Math.floor((amount * this.state.platformFeeRate) / 100);
		const netAmount = amount - feeAmount;

		this.stxTransfers.push({
			amount: feeAmount,
			from: this.caller,
			to: this.state.authorityContract,
		});
		this.stxTransfers.push({
			amount: netAmount,
			from: this.caller,
			to: creator,
		});

		const id = this.state.nextPaymentId;
		const payment: Payment = {
			contentId,
			consumer: this.caller,
			amount,
			timestamp: this.blockHeight,
			duration,
			status: "paid",
			creator,
			feeAmount,
			netAmount,
			refundAmount: 0,
			accessToken,
			signature,
			publicKey,
		};
		this.state.payments.set(id, payment);
		this.state.paymentStatuses.set(id, true);
		const contentKey = contentId.toString();
		const existing = this.state.paymentsByContent.get(contentKey) || [];
		this.state.paymentsByContent.set(contentKey, [...existing, id]);
		this.state.nextPaymentId++;
		this.state.totalPaymentsProcessed++;
		this.state.totalFeesCollected += feeAmount;
		return { ok: true, value: id };
	}

	requestRefund(paymentId: number, refundAmount: number): Result<boolean> {
		const payment = this.state.payments.get(paymentId);
		if (!payment) return { ok: false, value: ERR_PAYMENT_NOT_FOUND };
		if (payment.consumer !== this.caller)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (this.blockHeight > payment.timestamp + this.state.refundWindow)
			return { ok: false, value: ERR_PAYMENT_EXPIRED };
		if (refundAmount > payment.amount)
			return { ok: false, value: ERR_INVALID_REFUND_AMOUNT };
		if (payment.status !== "paid")
			return { ok: false, value: ERR_REFUND_NOT_ALLOWED };

		this.stxTransfers.push({
			amount: refundAmount,
			from: payment.creator,
			to: this.caller,
		});
		const updated: Payment = { ...payment, refundAmount, status: "refunded" };
		this.state.payments.set(paymentId, updated);
		this.state.paymentStatuses.set(paymentId, false);
		return { ok: true, value: true };
	}

	getPayment(id: number): Payment | undefined {
		return this.state.payments.get(id);
	}

	getPaymentsByContent(contentId: Uint8Array): number[] | undefined {
		return this.state.paymentsByContent.get(contentId.toString());
	}

	getPaymentStatus(id: number): boolean | undefined {
		return this.state.paymentStatuses.get(id);
	}

	getTotalPaymentsProcessed(): Result<number> {
		return { ok: true, value: this.state.totalPaymentsProcessed };
	}

	getTotalFeesCollected(): Result<number> {
		return { ok: true, value: this.state.totalFeesCollected };
	}
}

describe("PaymentProcessor", () => {
	let contract: PaymentProcessorMock;

	beforeEach(() => {
		contract = new PaymentProcessorMock();
		contract.reset();
	});

	it("sets authority contract successfully", () => {
		const result = contract.setAuthorityContract("ST2TEST");
		expect(result.ok).toBe(true);
		expect(contract.state.authorityContract).toBe("ST2TEST");
	});

	it("processes payment successfully", () => {
		contract.setAuthorityContract("ST2TEST");
		const contentId = new Uint8Array(32).fill(1);
		const accessToken = new Uint8Array(64).fill(2);
		const signature = new Uint8Array(65).fill(3);
		const publicKey = new Uint8Array(33).fill(4);
		const result = contract.payForContent(
			contentId,
			60,
			100,
			"ST3CREATOR",
			accessToken,
			signature,
			publicKey
		);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(0);
		const payment = contract.getPayment(0);
		expect(payment?.amount).toBe(100);
		expect(payment?.duration).toBe(60);
		expect(payment?.status).toBe("paid");
		expect(payment?.feeAmount).toBe(5);
		expect(payment?.netAmount).toBe(95);
		expect(contract.stxTransfers).toEqual([
			{ amount: 5, from: "ST1TEST", to: "ST2TEST" },
			{ amount: 95, from: "ST1TEST", to: "ST3CREATOR" },
		]);
		expect(contract.getTotalPaymentsProcessed().value).toBe(1);
		expect(contract.getTotalFeesCollected().value).toBe(5);
	});

	it("requests refund successfully", () => {
		contract.setAuthorityContract("ST2TEST");
		const contentId = new Uint8Array(32).fill(1);
		const accessToken = new Uint8Array(64).fill(2);
		const signature = new Uint8Array(65).fill(3);
		const publicKey = new Uint8Array(33).fill(4);
		contract.payForContent(
			contentId,
			60,
			100,
			"ST3CREATOR",
			accessToken,
			signature,
			publicKey
		);
		contract.blockHeight = 10;
		const result = contract.requestRefund(0, 50);
		expect(result.ok).toBe(true);
		const payment = contract.getPayment(0);
		expect(payment?.refundAmount).toBe(50);
		expect(payment?.status).toBe("refunded");
		expect(contract.stxTransfers[2]).toEqual({
			amount: 50,
			from: "ST3CREATOR",
			to: "ST1TEST",
		});
		expect(contract.getPaymentStatus(0)).toBe(false);
	});

	it("rejects payment without authority", () => {
		const contentId = new Uint8Array(32).fill(1);
		const accessToken = new Uint8Array(64).fill(2);
		const signature = new Uint8Array(65).fill(3);
		const publicKey = new Uint8Array(33).fill(4);
		const result = contract.payForContent(
			contentId,
			60,
			100,
			"ST3CREATOR",
			accessToken,
			signature,
			publicKey
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
	});

	it("rejects invalid duration", () => {
		contract.setAuthorityContract("ST2TEST");
		const contentId = new Uint8Array(32).fill(1);
		const accessToken = new Uint8Array(64).fill(2);
		const signature = new Uint8Array(65).fill(3);
		const publicKey = new Uint8Array(33).fill(4);
		const result = contract.payForContent(
			contentId,
			0,
			100,
			"ST3CREATOR",
			accessToken,
			signature,
			publicKey
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_DURATION);
	});

	it("rejects invalid amount", () => {
		contract.setAuthorityContract("ST2TEST");
		const contentId = new Uint8Array(32).fill(1);
		const accessToken = new Uint8Array(64).fill(2);
		const signature = new Uint8Array(65).fill(3);
		const publicKey = new Uint8Array(33).fill(4);
		const result = contract.payForContent(
			contentId,
			60,
			5,
			"ST3CREATOR",
			accessToken,
			signature,
			publicKey
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_AMOUNT);
	});

	it("rejects refund for expired payment", () => {
		contract.setAuthorityContract("ST2TEST");
		const contentId = new Uint8Array(32).fill(1);
		const accessToken = new Uint8Array(64).fill(2);
		const signature = new Uint8Array(65).fill(3);
		const publicKey = new Uint8Array(33).fill(4);
		contract.payForContent(
			contentId,
			60,
			100,
			"ST3CREATOR",
			accessToken,
			signature,
			publicKey
		);
		contract.blockHeight = 200;
		const result = contract.requestRefund(0, 50);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_PAYMENT_EXPIRED);
	});

	it("rejects refund by non-consumer", () => {
		contract.setAuthorityContract("ST2TEST");
		const contentId = new Uint8Array(32).fill(1);
		const accessToken = new Uint8Array(64).fill(2);
		const signature = new Uint8Array(65).fill(3);
		const publicKey = new Uint8Array(33).fill(4);
		contract.payForContent(
			contentId,
			60,
			100,
			"ST3CREATOR",
			accessToken,
			signature,
			publicKey
		);
		contract.caller = "ST4OTHER";
		const result = contract.requestRefund(0, 50);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_NOT_AUTHORIZED);
	});

	it("sets platform fee rate successfully", () => {
		contract.setAuthorityContract("ST2TEST");
		const result = contract.setPlatformFeeRate(10);
		expect(result.ok).toBe(true);
		expect(contract.state.platformFeeRate).toBe(10);
	});

	it("rejects invalid fee rate", () => {
		contract.setAuthorityContract("ST2TEST");
		const result = contract.setPlatformFeeRate(15);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_FEE_RATE);
	});

	it("gets payments by content", () => {
		contract.setAuthorityContract("ST2TEST");
		const contentId = new Uint8Array(32).fill(1);
		const accessToken = new Uint8Array(64).fill(2);
		const signature = new Uint8Array(65).fill(3);
		const publicKey = new Uint8Array(33).fill(4);
		contract.payForContent(
			contentId,
			60,
			100,
			"ST3CREATOR",
			accessToken,
			signature,
			publicKey
		);
		const payments = contract.getPaymentsByContent(contentId);
		expect(payments).toEqual([0]);
	});

	it("gets total payments processed", () => {
		contract.setAuthorityContract("ST2TEST");
		const contentId = new Uint8Array(32).fill(1);
		const accessToken = new Uint8Array(64).fill(2);
		const signature = new Uint8Array(65).fill(3);
		const publicKey = new Uint8Array(33).fill(4);
		contract.payForContent(
			contentId,
			60,
			100,
			"ST3CREATOR",
			accessToken,
			signature,
			publicKey
		);
		const result = contract.getTotalPaymentsProcessed();
		expect(result.value).toBe(1);
	});
});