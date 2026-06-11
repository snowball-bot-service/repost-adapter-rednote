export class SnowballException extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
/**
 * 获取 Handle Data 失败错误
 */
export class FetchHandleDataFailedException extends SnowballException {
    method;
    handleId;
    msg;
    constructor(method, handleId, msg) {
        super(`Fetch Handle Data Failed Exception | Method: ${method} | Handle Id: ${handleId} | Message: ${msg}`);
        this.method = method;
        this.handleId = handleId;
        this.msg = msg;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlcnJvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxNQUFNLE9BQWdCLGlCQUFrQixTQUFRLEtBQUs7SUFDbkQsWUFBc0IsT0FBZTtRQUNuQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDZixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbEQsSUFBSSxLQUFLLENBQUMsaUJBQWlCLEVBQUU7WUFDM0IsS0FBSyxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7U0FDakQ7SUFDSCxDQUFDO0NBQ0Y7QUFFRDs7R0FFRztBQUNILE1BQU0sT0FBTyw4QkFBK0IsU0FBUSxpQkFBaUI7SUFFakQ7SUFDQTtJQUNBO0lBSGxCLFlBQ2tCLE1BQW9CLEVBQ3BCLFFBQWdCLEVBQ2hCLEdBQVc7UUFFM0IsS0FBSyxDQUFDLGdEQUFnRCxNQUFNLGlCQUFpQixRQUFRLGVBQWUsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUozRixXQUFNLEdBQU4sTUFBTSxDQUFjO1FBQ3BCLGFBQVEsR0FBUixRQUFRLENBQVE7UUFDaEIsUUFBRyxHQUFILEdBQUcsQ0FBUTtJQUc3QixDQUFDO0NBQ0YifQ==