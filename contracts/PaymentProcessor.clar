 
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-CONTENT-ID u101)
(define-constant ERR-INVALID-DURATION u102)
(define-constant ERR-INVALID-AMOUNT u103)
(define-constant ERR-PAYMENT-ALREADY-EXISTS u104)
(define-constant ERR-PAYMENT-NOT-FOUND u105)
(define-constant ERR-INSUFFICIENT-BALANCE u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u108)
(define-constant ERR-INVALID-PAYMENT-STATUS u109)
(define-constant ERR-INVALID-CONSUMER u110)
(define-constant ERR-INVALID-CREATOR u111)
(define-constant ERR-PAYMENT-EXPIRED u112)
(define-constant ERR-INVALID-FEE-RATE u113)
(define-constant ERR-MAX-PAYMENTS-EXCEEDED u114)
(define-constant ERR-INVALID-CURRENCY u115)
(define-constant ERR-INVALID-REFUND-AMOUNT u116)
(define-constant ERR-REFUND-NOT-ALLOWED u117)
(define-constant ERR-INVALID-ACCESS-TOKEN u118)
(define-constant ERR-INVALID-SIGNATURE u119)
(define-constant ERR-INVALID-PUBLIC-KEY u120)

(define-data-var next-payment-id uint u0)
(define-data-var max-payments uint u10000)
(define-data-var platform-fee-rate uint u5)
(define-data-var authority-contract (optional principal) none)
(define-data-var total-payments-processed uint u0)
(define-data-var total-fees-collected uint u0)
(define-data-var refund-window uint u144)
(define-data-var min-payment-amount uint u10)
(define-data-var max-payment-amount uint u1000000)
(define-data-var supported-currency (string-ascii 3) "STX")

(define-map payments
  uint
  {
    content-id: (buff 32),
    consumer: principal,
    amount: uint,
    timestamp: uint,
    duration: uint,
    status: (string-ascii 10),
    creator: principal,
    fee-amount: uint,
    net-amount: uint,
    refund-amount: uint,
    access-token: (buff 64),
    signature: (buff 65),
    public-key: (buff 33)
  }
)

(define-map payments-by-content
  (buff 32)
  (list 100 uint)
)

(define-map payment-statuses
  uint
  bool
)

(define-read-only (get-payment (id uint))
  (map-get? payments id)
)

(define-read-only (get-payments-by-content (content-id (buff 32)))
  (map-get? payments-by-content content-id)
)

(define-read-only (get-payment-status (id uint))
  (map-get? payment-statuses id)
)

(define-private (validate-content-id (id (buff 32)))
  (if (is-eq (len id) u32)
      (ok true)
      (err ERR-INVALID-CONTENT-ID))
)

(define-private (validate-duration (dur uint))
  (if (> dur u0)
      (ok true)
      (err ERR-INVALID-DURATION))
)

(define-private (validate-amount (amt uint))
  (if (and (>= amt (var-get min-payment-amount)) (<= amt (var-get max-payment-amount)))
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-consumer (cons principal))
  (if (not (is-eq cons 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-CONSUMER))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-currency (cur (string-ascii 3)))
  (if (is-eq cur (var-get supported-currency))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-fee-rate (rate uint))
  (if (<= rate u10)
      (ok true)
      (err ERR-INVALID-FEE-RATE))
)

(define-private (validate-refund-amount (amt uint) (payment-amt uint))
  (if (<= amt payment-amt)
      (ok true)
      (err ERR-INVALID-REFUND-AMOUNT))
)

(define-private (validate-access-token (token (buff 64)))
  (if (is-eq (len token) u64)
      (ok true)
      (err ERR-INVALID-ACCESS-TOKEN))
)

(define-private (validate-signature (sig (buff 65)))
  (if (is-eq (len sig) u65)
      (ok true)
      (err ERR-INVALID-SIGNATURE))
)

(define-private (validate-public-key (pk (buff 33)))
  (if (is-eq (len pk) u33)
      (ok true)
      (err ERR-INVALID-PUBLIC-KEY))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-platform-fee-rate (new-rate uint))
  (begin
    (try! (validate-fee-rate new-rate))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set platform-fee-rate new-rate)
    (ok true)
  )
)

(define-public (set-min-payment-amount (new-min uint))
  (begin
    (asserts! (> new-min u0) (err ERR-INVALID-AMOUNT))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set min-payment-amount new-min)
    (ok true)
  )
)

(define-public (set-max-payment-amount (new-max uint))
  (begin
    (asserts! (> new-max (var-get min-payment-amount)) (err ERR-INVALID-AMOUNT))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-payment-amount new-max)
    (ok true)
  )
)

(define-public (set-refund-window (new-window uint))
  (begin
    (asserts! (> new-window u0) (err ERR-INVALID-DURATION))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set refund-window new-window)
    (ok true)
  )
)

(define-public (pay-for-content
  (content-id (buff 32))
  (duration uint)
  (amount uint)
  (creator principal)
  (access-token (buff 64))
  (signature (buff 65))
  (public-key (buff 33))
)
  (let (
        (next-id (var-get next-payment-id))
        (authority (var-get authority-contract))
        (fee-amount (/ (* amount (var-get platform-fee-rate)) u100))
        (net-amount (- amount fee-amount))
      )
    (asserts! (< next-id (var-get max-payments)) (err ERR-MAX-PAYMENTS-EXCEEDED))
    (try! (validate-content-id content-id))
    (try! (validate-duration duration))
    (try! (validate-amount amount))
    (try! (validate-consumer tx-sender))
    (try! (validate-access-token access-token))
    (try! (validate-signature signature))
    (try! (validate-public-key public-key))
    (asserts! (is-some authority) (err ERR-AUTHORITY-NOT-VERIFIED))
    (try! (stx-transfer? fee-amount tx-sender (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
    (try! (stx-transfer? net-amount tx-sender creator))
    (map-set payments next-id
      {
        content-id: content-id,
        consumer: tx-sender,
        amount: amount,
        timestamp: block-height,
        duration: duration,
        status: "paid",
        creator: creator,
        fee-amount: fee-amount,
        net-amount: net-amount,
        refund-amount: u0,
        access-token: access-token,
        signature: signature,
        public-key: public-key
      }
    )
    (map-set payment-statuses next-id true)
    (match (map-get? payments-by-content content-id)
      existing-list (map-set payments-by-content content-id (append existing-list next-id))
      (map-set payments-by-content content-id (list next-id))
    )
    (var-set next-payment-id (+ next-id u1))
    (var-set total-payments-processed (+ (var-get total-payments-processed) u1))
    (var-set total-fees-collected (+ (var-get total-fees-collected) fee-amount))
    (print { event: "payment-processed", id: next-id, amount: amount })
    (ok next-id)
  )
)

(define-public (request-refund (payment-id uint) (refund-amount uint))
  (let ((payment (map-get? payments payment-id)))
    (match payment
      p
        (begin
          (asserts! (is-eq (get consumer p) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (<= (+ block-height (var-get refund-window)) (get timestamp p)) (err ERR-PAYMENT-EXPIRED))
          (try! (validate-refund-amount refund-amount (get amount p)))
          (asserts! (is-eq (get status p) "paid") (err ERR-REFUND-NOT-ALLOWED))
          (try! (stx-transfer? refund-amount (get creator p) tx-sender))
          (map-set payments payment-id (merge p { refund-amount: refund-amount, status: "refunded" }))
          (map-set payment-statuses payment-id false)
          (print { event: "refund-requested", id: payment-id, amount: refund-amount })
          (ok true)
        )
      (err ERR-PAYMENT-NOT-FOUND)
    )
  )
)

(define-public (get-total-payments-processed)
  (ok (var-get total-payments-processed))
)

(define-public (get-total-fees-collected)
  (ok (var-get total-fees-collected))
)